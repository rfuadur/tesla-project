import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, type DbOrTx } from '../../db/client.js';
import { isUniqueViolation } from '../../db/errors.js';
import { pools, rideRequests, users, vehicles } from '../../db/schema.js';
import { quoteFare } from '../../domain/fare.js';
import { distanceKm } from '../../domain/geo.js';
import {
  ACTIVE_RIDE_STATUSES,
  assertRideTransition,
  type PoolStatus,
} from '../../domain/lifecycle.js';
import { conflict, notFound } from '../../lib/errors.js';
import { recordEvent, rideTimeline } from '../events/events.service.js';
import { lockPool, releaseSeats } from '../pools/pools.service.js';
import { rideFare } from './ride-fare.js';
import type { CreateRideInput } from './rides.schemas.js';

const driver = alias(users, 'driver');

/**
 * Everything a passenger may see about their rides: the ride, and (once matched) the Tesla, its driver
 * and how many others share it. `coRiders` is only a count, never who they are (assumption A17).
 */
function selectRides(tx: DbOrTx) {
  return tx
    .select({
      ride: rideRequests,
      pool: { status: pools.status, capacity: pools.capacity, seatsTaken: pools.seatsTaken },
      vehicleName: vehicles.name,
      driverName: driver.fullName,
      coRiders: sql<number>`(
        SELECT count(*)::int FROM ride_requests AS other
        WHERE other.pool_id = ${rideRequests.poolId}
          AND other.id <> ${rideRequests.id}
          AND other.status <> 'CANCELLED')`,
    })
    .from(rideRequests)
    .leftJoin(pools, eq(pools.id, rideRequests.poolId))
    .leftJoin(vehicles, eq(vehicles.id, pools.vehicleId))
    .leftJoin(driver, eq(driver.id, vehicles.driverId));
}

interface RideRow {
  ride: typeof rideRequests.$inferSelect;
  pool: { status: PoolStatus; capacity: number; seatsTaken: number } | null;
  vehicleName: string | null;
  driverName: string | null;
  coRiders: number;
}

/** The API's view of a ride. Money stays in paisa; the web app formats it as taka. */
function toRideView({ ride, pool, vehicleName, driverName, coRiders }: RideRow) {
  return {
    id: ride.id,
    status: ride.status,
    pickupZone: ride.pickupZoneCode,
    dropoffZone: ride.dropoffZoneCode,
    seats: ride.seats,
    paymentMethod: ride.paymentMethod,
    distanceKm: ride.distanceKm,
    fare: rideFare(ride),
    pool: pool && {
      status: pool.status,
      vehicleName,
      driverName,
      coRiders,
      seatsLeft: pool.capacity - pool.seatsTaken,
    },
    requestedAt: ride.requestedAt,
    matchedAt: ride.matchedAt,
    startedAt: ride.startedAt,
    completedAt: ride.completedAt,
    cancelledAt: ride.cancelledAt,
    cancelReason: ride.cancelReason,
  };
}

export type RideView = ReturnType<typeof toRideView>;

/**
 * Ownership is part of the query itself: the ride must have this id AND belong to this passenger.
 * "Doesn't exist" and "isn't yours" give the same 404, so nobody can probe for other people's rides.
 */
async function findOwnRide(tx: DbOrTx, passengerId: string, rideId: string): Promise<RideRow> {
  const [row] = await selectRides(tx).where(
    and(eq(rideRequests.id, rideId), eq(rideRequests.passengerId, passengerId)),
  );
  if (!row) throw notFound('Ride not found.');
  return row;
}

/** One ride with its full history. */
export async function getRide(passengerId: string, rideId: string) {
  const row = await findOwnRide(db, passengerId, rideId);
  return { ...toRideView(row), timeline: await rideTimeline(db, rideId) };
}

/** The passenger's own rides, newest first: active ones, finished ones, or both. */
export async function listRides(
  passengerId: string,
  { scope, limit }: { scope?: 'active' | 'history'; limit: number },
): Promise<RideView[]> {
  const byScope =
    scope === 'active'
      ? inArray(rideRequests.status, [...ACTIVE_RIDE_STATUSES])
      : scope === 'history'
        ? inArray(rideRequests.status, ['COMPLETED', 'CANCELLED'])
        : undefined;

  const rows = await selectRides(db)
    .where(and(eq(rideRequests.passengerId, passengerId), byScope))
    .orderBy(desc(rideRequests.requestedAt))
    .limit(limit);
  return rows.map(toRideView);
}

/** Books a ride: priced solo (the most it can cost), waiting for a Tesla. */
export async function requestRide(passengerId: string, input: CreateRideInput) {
  const km = distanceKm(input.pickupZone, input.dropoffZone);
  const solo = quoteFare({ distanceKm: km, seats: input.seats, shared: false });

  let rideId: string;
  try {
    rideId = await db.transaction(async (tx) => {
      const [ride] = await tx
        .insert(rideRequests)
        .values({
          passengerId,
          pickupZoneCode: input.pickupZone,
          dropoffZoneCode: input.dropoffZone,
          seats: input.seats,
          paymentMethod: input.paymentMethod,
          distanceKm: km,
          fareRuleVersion: solo.ruleVersion,
          estimatedFarePaisa: solo.totalPaisa,
        })
        .returning({ id: rideRequests.id });
      if (!ride) throw new Error('insert returned no row');

      await recordEvent(tx, {
        type: 'RIDE_REQUESTED',
        rideRequestId: ride.id,
        actorUserId: passengerId,
        toStatus: 'REQUESTED',
        details: { seats: input.seats, distanceKm: km, estimatedFarePaisa: solo.totalPaisa },
      });
      // Phase 9: try to join a compatible open pool right here, inside the same transaction.
      return ride.id;
    });
  } catch (err) {
    // The database's one-active-ride-per-passenger index decides, so even a double-click can't
    // create two bookings: the second insert fails and becomes a friendly 409.
    if (isUniqueViolation(err, 'ride_requests_one_active_per_passenger')) {
      throw conflict(
        'ACTIVE_RIDE_EXISTS',
        'You already have an active ride. Cancel it or wait for it to finish before booking another.',
      );
    }
    throw err;
  }

  return getRide(passengerId, rideId);
}

/**
 * Cancels the passenger's own ride, if the state machine still allows it (before the trip starts).
 * A matched ride also gives its seats back to the pool; a pool left empty is cancelled.
 */
export async function cancelRide(passengerId: string, rideId: string, reason?: string) {
  const ownRide = and(eq(rideRequests.id, rideId), eq(rideRequests.passengerId, passengerId));

  // Returns false if the ride changed between our first look and our lock, so we try again.
  const tryCancel = () =>
    db.transaction(async (tx) => {
      // Locks are always taken pool → ride (the order claimSeats uses), to avoid deadlocks. So first
      // look, without locking, at which pool the ride is in…
      const [seen] = await tx
        .select({ poolId: rideRequests.poolId })
        .from(rideRequests)
        .where(ownRide);
      if (!seen) throw notFound('Ride not found.');

      // …then lock that pool, then the ride itself.
      const pool = seen.poolId ? await lockPool(tx, seen.poolId) : null;
      const [ride] = await tx.select().from(rideRequests).where(ownRide).for('update');
      if (!ride) throw notFound('Ride not found.');
      if (ride.poolId !== seen.poolId) return false; // a driver matched it in between: start over

      assertRideTransition(ride.status, 'CANCELLED'); // 409 once the trip has started or finished

      await tx
        .update(rideRequests)
        .set({ status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason ?? null })
        .where(eq(rideRequests.id, ride.id));
      await recordEvent(tx, {
        type: 'RIDE_CANCELLED',
        rideRequestId: ride.id,
        poolId: ride.poolId ?? undefined,
        actorUserId: passengerId,
        fromStatus: ride.status,
        toStatus: 'CANCELLED',
        details: { ...(reason && { reason }), ...(pool && { seatsReleased: ride.seats }) },
      });

      if (pool) await releaseSeats(tx, pool, ride);
      return true;
    });

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (await tryCancel()) return getRide(passengerId, rideId);
  }
  throw conflict('TRY_AGAIN', 'Your ride changed while you were cancelling. Please try again.');
}
