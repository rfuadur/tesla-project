import { and, asc, eq } from 'drizzle-orm';
import { db, type DbOrTx } from '../../db/client.js';
import { pools, rideRequests, users, vehicles } from '../../db/schema.js';
import type { ZoneCode } from '../../domain/geo.js';
import { canJoin } from '../../domain/matching.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { recordEvent } from '../events/events.service.js';
import {
  activePoolOf,
  claimSeats,
  type PoolView,
  poolViewById,
  refusalError,
  ridersInPool,
} from '../pools/pools.service.js';
import { rideFare } from '../rides/ride-fare.js';

type VehicleRow = typeof vehicles.$inferSelect;

const zone = (code: string) => code as ZoneCode;

/** The driver's Tesla (one per driver). `lock` holds the row until the transaction ends. */
export async function getDriverVehicle(
  tx: DbOrTx,
  driverId: string,
  { lock = false } = {},
): Promise<VehicleRow> {
  const query = tx.select().from(vehicles).where(eq(vehicles.driverId, driverId));
  const [vehicle] = lock ? await query.for('update') : await query;
  if (!vehicle) throw forbidden('No Tesla is registered to your account.');
  return vehicle;
}

export const vehicleView = (vehicle: VehicleRow) => ({
  id: vehicle.id,
  name: vehicle.name,
  capacity: vehicle.capacity,
  isOnline: vehicle.isOnline,
  currentZone: vehicle.currentZoneCode,
});

/** Go online in a zone, or offline. Not allowed in the middle of a trip (assumption A15). */
export async function setAvailability(
  driverId: string,
  input: { online: boolean; zone?: ZoneCode },
) {
  return db.transaction(async (tx) => {
    const vehicle = await getDriverVehicle(tx, driverId, { lock: true });
    const newZone = input.zone ?? vehicle.currentZoneCode;

    if (await activePoolOf(tx, vehicle.id)) {
      if (!input.online || newZone !== vehicle.currentZoneCode) {
        throw conflict(
          'ACTIVE_POOL_EXISTS',
          'Finish your current trip before going offline or changing zone.',
        );
      }
    }
    if (input.online && !newZone) {
      throw badRequest('ZONE_REQUIRED', 'Choose the zone you are in to go online.');
    }

    const [updated] = await tx
      .update(vehicles)
      .set({ isOnline: input.online, currentZoneCode: newZone, updatedAt: new Date() })
      .where(eq(vehicles.id, vehicle.id))
      .returning();
    if (!updated) throw new Error('update returned no row');
    return vehicleView(updated);
  });
}

/**
 * What Jashim sees: rides waiting in his zone, oldest first, that would fit his Tesla right now.
 * With riders already aboard, only rides that pass the matching rule are shown (assumption A16).
 */
export async function relevantRequests(driverId: string) {
  const vehicle = await getDriverVehicle(db, driverId);
  if (!vehicle.isOnline || !vehicle.currentZoneCode) {
    throw conflict('DRIVER_OFFLINE', 'Go online to see ride requests.');
  }

  const pool = await activePoolOf(db, vehicle.id);
  if (pool?.status === 'STARTED') return []; // finish this trip first

  const waiting = await db
    .select({ ride: rideRequests, passengerName: users.fullName })
    .from(rideRequests)
    .innerJoin(users, eq(users.id, rideRequests.passengerId))
    .where(
      and(
        eq(rideRequests.status, 'REQUESTED'),
        eq(rideRequests.pickupZoneCode, vehicle.currentZoneCode),
      ),
    )
    .orderBy(asc(rideRequests.requestedAt))
    .limit(50);

  // No pool yet? Check against an empty one: same zone, all of Bullet's seats free.
  const target = pool
    ? {
        status: pool.status,
        pickupZone: zone(pool.pickupZoneCode),
        capacity: pool.capacity,
        seatsTaken: pool.seatsTaken,
      }
    : {
        status: 'ACCEPTED' as const,
        pickupZone: zone(vehicle.currentZoneCode),
        capacity: vehicle.capacity,
        seatsTaken: 0,
      };
  const aboard = pool ? await ridersInPool(db, pool.id) : [];
  const aboardDropoffs = aboard.map((rider) => ({ dropoffZone: zone(rider.dropoffZoneCode) }));

  return waiting
    .filter(
      ({ ride }) =>
        canJoin(target, aboardDropoffs, {
          pickupZone: zone(ride.pickupZoneCode),
          dropoffZone: zone(ride.dropoffZoneCode),
          seats: ride.seats,
        }).ok,
    )
    .map(({ ride, passengerName }) => ({
      rideId: ride.id,
      passengerName,
      pickupZone: ride.pickupZoneCode,
      dropoffZone: ride.dropoffZoneCode,
      seats: ride.seats,
      distanceKm: ride.distanceKm,
      fare: rideFare(ride),
      requestedAt: ride.requestedAt,
    }));
}

/**
 * Jashim accepts a waiting ride. If Bullet has no trip yet, this creates one at his zone; either way the
 * ride joins through claimSeats(), the one place seats are handed out.
 */
export async function acceptRide(driverId: string, rideId: string): Promise<PoolView> {
  const poolId = await db.transaction(async (tx) => {
    // Lock the Tesla first (lock order: Tesla → pool → ride). Two accepts by the same driver then run
    // one after another, so they can't both create a new pool for Bullet.
    const vehicle = await getDriverVehicle(tx, driverId, { lock: true });
    if (!vehicle.isOnline || !vehicle.currentZoneCode) {
      throw conflict('DRIVER_OFFLINE', 'Go online before accepting rides.');
    }

    // A quick look without locking; claimSeats() locks the ride and checks it again.
    const [ride] = await tx.select().from(rideRequests).where(eq(rideRequests.id, rideId));
    if (!ride) throw notFound('Ride not found.');
    if (ride.status !== 'REQUESTED') {
      throw conflict('RIDE_NOT_AVAILABLE', 'This ride is no longer waiting for a Tesla.');
    }
    if (ride.pickupZoneCode !== vehicle.currentZoneCode) throw refusalError('DIFFERENT_PICKUP');

    let pool = await activePoolOf(tx, vehicle.id);
    if (!pool) {
      [pool] = await tx
        .insert(pools)
        .values({
          vehicleId: vehicle.id,
          pickupZoneCode: vehicle.currentZoneCode,
          capacity: vehicle.capacity, // copied, so the CHECK constraint can enforce it on this row
        })
        .returning();
      if (!pool) throw new Error('insert returned no row');
      await recordEvent(tx, {
        type: 'POOL_CREATED',
        poolId: pool.id,
        actorUserId: driverId,
        toStatus: 'ACCEPTED',
        details: { vehicle: vehicle.name, capacity: vehicle.capacity },
      });
    }

    const verdict = await claimSeats(tx, {
      poolId: pool.id,
      rideId,
      actorUserId: driverId,
      via: 'DRIVER_ACCEPT',
    });
    // Throwing rolls the whole transaction back, including a pool we created a moment ago.
    if (!verdict.ok) throw refusalError(verdict.reason);
    return pool.id;
  });

  return poolViewById(poolId);
}

/** The driver's trip in progress, or null. */
export async function currentPool(driverId: string): Promise<PoolView | null> {
  const vehicle = await getDriverVehicle(db, driverId);
  const pool = await activePoolOf(db, vehicle.id);
  return pool ? poolViewById(pool.id) : null;
}
