import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { db, type DbOrTx, type Tx } from '../../db/client.js';
import { payments, pools, rideRequests, users } from '../../db/schema.js';
import { type FareRuleVersion, quoteFare } from '../../domain/fare.js';
import type { ZoneCode } from '../../domain/geo.js';
import {
  ACTIVE_POOL_STATUSES,
  assertPoolTransition,
  assertRideTransition,
  JOINABLE_POOL_STATUSES,
  type RideStatus,
} from '../../domain/lifecycle.js';
import {
  canJoin,
  dropOffOrder,
  type JoinRefusal,
  type JoinVerdict,
} from '../../domain/matching.js';
import { conflict, notFound } from '../../lib/errors.js';
import { type EventType, recordEvent } from '../events/events.service.js';
import { rideFare } from '../rides/ride-fare.js';

type PoolRow = typeof pools.$inferSelect;
type RideRow = typeof rideRequests.$inferSelect;

// Zone codes come out of the database as plain text; the foreign key to `zones` guarantees they are valid.
const zone = (code: string) => code as ZoneCode;

// ─── Locks ───────────────────────────────────────────────────────────────────────────────────────
// Every change to a pool's riders starts by locking the pool row (SELECT … FOR UPDATE). The lock is
// held until the transaction ends, so changes to one pool happen strictly one after another.
// Locks are always taken in the same order (Tesla → pool → ride), so two transactions can never each
// hold a lock the other one is waiting for (a deadlock).

export async function lockPool(tx: Tx, poolId: string): Promise<PoolRow> {
  const [pool] = await tx.select().from(pools).where(eq(pools.id, poolId)).for('update');
  if (!pool) throw notFound('Pool not found.');
  return pool;
}

/** Locks a pool only if it belongs to this Tesla. Someone else's pool is a 404, like a missing one. */
async function lockOwnPool(tx: Tx, poolId: string, vehicleId: string): Promise<PoolRow> {
  const [pool] = await tx
    .select()
    .from(pools)
    .where(and(eq(pools.id, poolId), eq(pools.vehicleId, vehicleId)))
    .for('update');
  if (!pool) throw notFound('Pool not found.');
  return pool;
}

async function lockRide(tx: Tx, rideId: string): Promise<RideRow> {
  const [ride] = await tx
    .select()
    .from(rideRequests)
    .where(eq(rideRequests.id, rideId))
    .for('update');
  if (!ride) throw notFound('Ride not found.');
  return ride;
}

/** Everyone in the pool who hasn't cancelled. Read it after locking the pool, so it can't change under us. */
export async function ridersInPool(tx: DbOrTx, poolId: string): Promise<RideRow[]> {
  return tx
    .select()
    .from(rideRequests)
    .where(and(eq(rideRequests.poolId, poolId), ne(rideRequests.status, 'CANCELLED')))
    .orderBy(asc(rideRequests.matchedAt));
}

export async function activePoolOf(tx: DbOrTx, vehicleId: string): Promise<PoolRow | undefined> {
  const [pool] = await tx
    .select()
    .from(pools)
    .where(and(eq(pools.vehicleId, vehicleId), inArray(pools.status, [...ACTIVE_POOL_STATUSES])));
  return pool;
}

/**
 * Moves one ride to its next status: checked against the state machine, written as a compare-and-set
 * (only if the status is still what we read), and recorded in the ride's history.
 */
async function moveRide(
  tx: Tx,
  ride: RideRow,
  to: RideStatus,
  event: {
    type: EventType;
    poolId: string;
    actorUserId?: string | null;
    details?: Record<string, unknown>;
    set?: Partial<typeof rideRequests.$inferInsert>;
  },
): Promise<void> {
  assertRideTransition(ride.status, to);
  await tx
    .update(rideRequests)
    .set({ status: to, ...event.set })
    .where(and(eq(rideRequests.id, ride.id), eq(rideRequests.status, ride.status)));
  await recordEvent(tx, {
    type: event.type,
    rideRequestId: ride.id,
    poolId: event.poolId,
    actorUserId: event.actorUserId,
    fromStatus: ride.status,
    toStatus: to,
    details: event.details,
  });
}

// ─── Claiming seats: the one place capacity is enforced ─────────────────────────────────────────

const REFUSALS: Record<JoinRefusal, [code: string, message: string]> = {
  NOT_ENOUGH_SEATS: ['POOL_FULL', 'This Tesla does not have enough free seats for this booking.'],
  DROPOFF_TOO_FAR: ['NOT_COMPATIBLE', "This drop-off is too far from the other riders' drop-offs."],
  DIFFERENT_PICKUP: ['WRONG_ZONE', 'This ride starts in a different zone.'],
  POOL_NOT_JOINABLE: ['POOL_ALREADY_STARTED', 'This trip has already started.'],
};

export const refusalError = (reason: JoinRefusal) => conflict(...REFUSALS[reason]);

/**
 * Puts a waiting ride into a pool if it fits. Every way of joining a pool (a driver accepting now, and
 * auto-join from Phase 9) goes through here, so the capacity rule lives in exactly one place.
 *
 * Why it can't oversell Bullet: step 1 locks the pool row, so two claims on the same pool run one after
 * the other, and the second one reads the seats the first one already took. The CHECK constraint
 * (seats_taken <= capacity) is the database's own guarantee behind it.
 */
export async function claimSeats(
  tx: Tx,
  args: {
    poolId: string;
    rideId: string;
    actorUserId: string | null;
    via: 'DRIVER_ACCEPT' | 'AUTO_JOIN';
  },
): Promise<JoinVerdict> {
  const pool = await lockPool(tx, args.poolId); // 1. competing claims wait here
  const ride = await lockRide(tx, args.rideId); // 2. lock order: pool → ride
  if (ride.status !== 'REQUESTED') {
    throw conflict('RIDE_NOT_AVAILABLE', 'This ride is no longer waiting for a Tesla.');
  }

  const aboard = await ridersInPool(tx, pool.id); // 3. fresh data, read while holding the lock
  const verdict = canJoin(
    {
      status: pool.status,
      pickupZone: zone(pool.pickupZoneCode),
      capacity: pool.capacity,
      seatsTaken: pool.seatsTaken,
    },
    aboard.map((rider) => ({ dropoffZone: zone(rider.dropoffZoneCode) })),
    {
      pickupZone: zone(ride.pickupZoneCode),
      dropoffZone: zone(ride.dropoffZoneCode),
      seats: ride.seats,
    },
  ); // 4. the pure rule decides
  if (!verdict.ok) return verdict;

  const [updated] = await tx
    .update(pools)
    .set({ seatsTaken: sql`${pools.seatsTaken} + ${ride.seats}` }) // 5. the CHECK constraint backs this up
    .where(eq(pools.id, pool.id))
    .returning({ seatsTaken: pools.seatsTaken });

  await moveRide(tx, ride, 'MATCHED', {
    type: 'RIDE_MATCHED',
    poolId: pool.id,
    actorUserId: args.actorUserId,
    details: { via: args.via, seatsTaken: updated?.seatsTaken, capacity: pool.capacity },
    set: { poolId: pool.id, matchedAt: new Date() },
  });

  // Bullet is already waiting at the curb, so the new rider can board straight away.
  if (pool.status === 'DRIVER_ARRIVED') {
    await moveRide(tx, { ...ride, status: 'MATCHED', poolId: pool.id }, 'DRIVER_ARRIVED', {
      type: 'DRIVER_ARRIVED',
      poolId: pool.id,
    });
  }
  return { ok: true };
}

/**
 * Auto-join (assumption A5): right after a passenger books, try the open pools at their pickup zone,
 * oldest first (the pool that has waited longest fills first, so it can leave sooner).
 *
 * The candidate list is only a first guess, read without locks. Each attempt goes through claimSeats(),
 * which locks the pool and checks everything again, so a pool that filled up a moment ago is simply
 * refused. Pools are always tried in the same order (accepted_at, id), so two bookings racing for the
 * same pools lock them in the same order and can't deadlock.
 *
 * Returns the pool joined, or null: the ride keeps waiting for a driver.
 */
export async function autoJoin(
  tx: Tx,
  ride: Pick<RideRow, 'id' | 'pickupZoneCode' | 'seats'>,
): Promise<string | null> {
  const candidates = await tx
    .select({ id: pools.id })
    .from(pools)
    .where(
      and(
        eq(pools.pickupZoneCode, ride.pickupZoneCode),
        inArray(pools.status, [...JOINABLE_POOL_STATUSES]),
        sql`${pools.capacity} - ${pools.seatsTaken} >= ${ride.seats}`,
      ),
    )
    .orderBy(asc(pools.acceptedAt), asc(pools.id))
    .limit(5);

  for (const candidate of candidates) {
    const verdict = await claimSeats(tx, {
      poolId: candidate.id,
      rideId: ride.id,
      actorUserId: null, // the system matched it, not a person
      via: 'AUTO_JOIN',
    });
    if (verdict.ok) return candidate.id;

    // Kept in the passenger's timeline, so "why am I still waiting?" always has an answer.
    await recordEvent(tx, {
      type: 'SEAT_CLAIM_REJECTED',
      rideRequestId: ride.id,
      poolId: candidate.id,
      details: { reason: verdict.reason },
    });
  }
  return null;
}

/**
 * Gives a cancelled rider's seats back to the pool (call it with the pool already locked).
 * A pool left with nobody in it before the trip starts is cancelled, which frees the driver.
 */
export async function releaseSeats(tx: Tx, pool: PoolRow, ride: RideRow): Promise<void> {
  const [updated] = await tx
    .update(pools)
    .set({ seatsTaken: sql`${pools.seatsTaken} - ${ride.seats}` })
    .where(eq(pools.id, pool.id))
    .returning({ seatsTaken: pools.seatsTaken });

  if (updated?.seatsTaken === 0) {
    assertPoolTransition(pool.status, 'CANCELLED');
    await tx
      .update(pools)
      .set({ status: 'CANCELLED', cancelledAt: new Date() })
      .where(eq(pools.id, pool.id));
    await recordEvent(tx, {
      type: 'POOL_CANCELLED',
      poolId: pool.id,
      fromStatus: pool.status,
      toStatus: 'CANCELLED',
      details: { reason: 'every rider cancelled' },
    });
  }
}

// ─── The trip: arrive → start → drop-off ────────────────────────────────────────────────────────

/** Jashim is at the pickup: the pool and everyone matched into it move to DRIVER_ARRIVED. */
export async function markArrived(vehicleId: string, driverId: string, poolId: string) {
  await db.transaction(async (tx) => {
    const pool = await lockOwnPool(tx, poolId, vehicleId);
    assertPoolTransition(pool.status, 'DRIVER_ARRIVED');

    await tx
      .update(pools)
      .set({ status: 'DRIVER_ARRIVED', arrivedAt: new Date() })
      .where(eq(pools.id, pool.id));
    await recordEvent(tx, {
      type: 'DRIVER_ARRIVED',
      poolId,
      actorUserId: driverId,
      fromStatus: pool.status,
      toStatus: 'DRIVER_ARRIVED',
    });

    for (const rider of await ridersInPool(tx, pool.id)) {
      await moveRide(tx, rider, 'DRIVER_ARRIVED', {
        type: 'DRIVER_ARRIVED',
        poolId,
        actorUserId: driverId,
      });
    }
  });
}

/**
 * The trip starts: nobody else can join, and the group is final. So this is when fares are decided:
 * if at least two separate bookings are aboard, everyone gets the pool discount.
 */
export async function startTrip(vehicleId: string, driverId: string, poolId: string) {
  await db.transaction(async (tx) => {
    const pool = await lockOwnPool(tx, poolId, vehicleId);
    assertPoolTransition(pool.status, 'STARTED');

    const aboard = await ridersInPool(tx, pool.id);
    if (aboard.length === 0)
      throw conflict('POOL_EMPTY', 'There is nobody aboard to start a trip with.');

    const shared = aboard.length >= 2;
    const startedAt = new Date();
    for (const rider of aboard) {
      const { poolDiscountPaisa, totalPaisa } = quoteFare({
        distanceKm: rider.distanceKm,
        seats: rider.seats,
        shared,
        ruleVersion: rider.fareRuleVersion as FareRuleVersion, // the version the ride was booked with
      });
      await moveRide(tx, rider, 'STARTED', {
        type: 'TRIP_STARTED',
        poolId,
        actorUserId: driverId,
        details: { shared, discountPaisa: poolDiscountPaisa, finalPaisa: totalPaisa },
        set: { startedAt, poolDiscountPaisa },
      });
    }

    await tx.update(pools).set({ status: 'STARTED', startedAt }).where(eq(pools.id, pool.id));
    await recordEvent(tx, {
      type: 'TRIP_STARTED',
      poolId,
      actorUserId: driverId,
      fromStatus: pool.status,
      toStatus: 'STARTED',
      details: { riders: aboard.length, shared },
    });
  });
}

/**
 * One passenger gets off: their ride completes and their cash payment is recorded.
 * When the last one is dropped off, the pool completes too.
 */
export async function dropOff(vehicleId: string, driverId: string, poolId: string, rideId: string) {
  await db.transaction(async (tx) => {
    const pool = await lockOwnPool(tx, poolId, vehicleId);
    const [ride] = await tx
      .select()
      .from(rideRequests)
      .where(and(eq(rideRequests.id, rideId), eq(rideRequests.poolId, pool.id)))
      .for('update');
    if (!ride) throw notFound('That passenger is not in this trip.');

    assertRideTransition(ride.status, 'COMPLETED'); // only riders on a started trip can be dropped off
    if (ride.finalFarePaisa === null) throw new Error('a started ride must have a final fare');

    const completedAt = new Date();
    await moveRide(tx, ride, 'COMPLETED', {
      type: 'DROPPED_OFF',
      poolId,
      actorUserId: driverId,
      details: { paidPaisa: ride.finalFarePaisa, method: ride.paymentMethod },
      set: { completedAt },
    });
    await tx.insert(payments).values({
      rideRequestId: ride.id,
      method: ride.paymentMethod,
      amountPaisa: ride.finalFarePaisa,
      paidAt: completedAt,
    });

    const stillAboard = (await ridersInPool(tx, pool.id)).some((r) => r.status === 'STARTED');
    if (!stillAboard) {
      assertPoolTransition(pool.status, 'COMPLETED');
      await tx.update(pools).set({ status: 'COMPLETED', completedAt }).where(eq(pools.id, pool.id));
      await recordEvent(tx, {
        type: 'POOL_COMPLETED',
        poolId,
        fromStatus: pool.status,
        toStatus: 'COMPLETED',
      });
    }
  });
}

// ─── What the driver sees ───────────────────────────────────────────────────────────────────────

/** A pool as Jashim sees it: his riders' names, seats, drop-offs, fares, and a suggested drop-off order. */
export async function poolView(tx: DbOrTx, pool: PoolRow) {
  const rows = await tx
    .select({ ride: rideRequests, passengerName: users.fullName })
    .from(rideRequests)
    .innerJoin(users, eq(users.id, rideRequests.passengerId))
    .where(eq(rideRequests.poolId, pool.id))
    .orderBy(asc(rideRequests.matchedAt));

  const stillToDropOff = rows
    .filter(({ ride }) => ride.status !== 'CANCELLED' && ride.status !== 'COMPLETED')
    .map(({ ride }) => zone(ride.dropoffZoneCode));

  return {
    id: pool.id,
    status: pool.status,
    pickupZone: pool.pickupZoneCode,
    capacity: pool.capacity,
    seatsTaken: pool.seatsTaken,
    seatsLeft: pool.capacity - pool.seatsTaken,
    riders: rows.map(({ ride, passengerName }) => ({
      rideId: ride.id,
      passengerName,
      seats: ride.seats,
      dropoffZone: ride.dropoffZoneCode,
      status: ride.status,
      fare: rideFare(ride),
    })),
    dropOffOrder: dropOffOrder(zone(pool.pickupZoneCode), stillToDropOff),
    collectedPaisa: rows
      .filter(({ ride }) => ride.status === 'COMPLETED')
      .reduce((sum, { ride }) => sum + (ride.finalFarePaisa ?? 0), 0),
    acceptedAt: pool.acceptedAt,
    arrivedAt: pool.arrivedAt,
    startedAt: pool.startedAt,
    completedAt: pool.completedAt,
    cancelledAt: pool.cancelledAt,
  };
}

export type PoolView = Awaited<ReturnType<typeof poolView>>;

export async function poolViewById(poolId: string): Promise<PoolView> {
  const [pool] = await db.select().from(pools).where(eq(pools.id, poolId));
  if (!pool) throw notFound('Pool not found.');
  return poolView(db, pool);
}

/** The Tesla's finished trips, newest first. */
export async function poolHistory(vehicleId: string, limit: number): Promise<PoolView[]> {
  const finished = await db
    .select()
    .from(pools)
    .where(and(eq(pools.vehicleId, vehicleId), inArray(pools.status, ['COMPLETED', 'CANCELLED'])))
    .orderBy(desc(pools.acceptedAt))
    .limit(limit);
  return Promise.all(finished.map((pool) => poolView(db, pool)));
}
