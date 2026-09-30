import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, type DbOrTx } from '../../db/client.js';
import { isUniqueViolation } from '../../db/errors.js';
import { pools, rideRequests, users, vehicles } from '../../db/schema.js';
import { type FareRuleVersion, quoteFare } from '../../domain/fare.js';
import { distanceKm } from '../../domain/geo.js';
import {
  ACTIVE_RIDE_STATUSES,
  assertRideTransition,
  type PoolStatus,
} from '../../domain/lifecycle.js';
import { conflict, notFound } from '../../lib/errors.js';
import { recordEvent, rideTimeline } from '../events/events.service.js';
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
  // Rides only ever store versions that exist in FARE_RULES.
  const ruleVersion = ride.fareRuleVersion as FareRuleVersion;
  const pooled = quoteFare({
    distanceKm: ride.distanceKm,
    seats: ride.seats,
    shared: true,
    ruleVersion,
  });

  return {
    id: ride.id,
    status: ride.status,
    pickupZone: ride.pickupZoneCode,
    dropoffZone: ride.dropoffZoneCode,
    seats: ride.seats,
    paymentMethod: ride.paymentMethod,
    distanceKm: ride.distanceKm,
    fare: {
      ruleVersion,
      estimatedPaisa: ride.estimatedFarePaisa, // solo price: the most this ride can cost
      pooledPaisa: pooled.totalPaisa, // the price if the trip starts shared
      discountPaisa: ride.poolDiscountPaisa, // decided when the trip starts
      finalPaisa: ride.finalFarePaisa,
    },
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

/** Cancels the passenger's own ride, if the state machine still allows it (before the trip starts). */
export async function cancelRide(passengerId: string, rideId: string, reason?: string) {
  await db.transaction(async (tx) => {
    // FOR UPDATE locks this ride row until we commit, so nothing else can change it halfway through.
    const [ride] = await tx
      .select()
      .from(rideRequests)
      .where(and(eq(rideRequests.id, rideId), eq(rideRequests.passengerId, passengerId)))
      .for('update');
    if (!ride) throw notFound('Ride not found.');

    assertRideTransition(ride.status, 'CANCELLED'); // 409 once the trip has started or finished

    if (ride.poolId) {
      // A matched ride must also give its seats back to the pool. That arrives with pools (Phase 8).
      throw new Error('cancelling a ride that is already in a pool is not implemented yet');
    }

    await tx
      .update(rideRequests)
      .set({ status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason ?? null })
      .where(eq(rideRequests.id, ride.id));

    await recordEvent(tx, {
      type: 'RIDE_CANCELLED',
      rideRequestId: ride.id,
      actorUserId: passengerId,
      fromStatus: ride.status,
      toStatus: 'CANCELLED',
      details: reason ? { reason } : {},
    });
  });

  return getRide(passengerId, rideId);
}
