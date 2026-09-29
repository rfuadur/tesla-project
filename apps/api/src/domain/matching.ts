import { distanceKm, type ZoneCode } from './geo.js';
import { JOINABLE_POOL_STATUSES, type PoolStatus } from './lifecycle.js';

// The matching rule from docs/domain.md §2: when may a waiting ride join a pool?

/** Drop-offs in one pool may be at most this far apart, which caps anyone's detour per extra stop. */
export const MAX_DROPOFF_GAP_KM = 3;

/** A booking takes 1 to 3 seats: a group travelling together (assumption A9). */
export const MAX_SEATS_PER_RIDE = 3;

export interface PoolSnapshot {
  status: PoolStatus;
  pickupZone: ZoneCode;
  capacity: number;
  seatsTaken: number;
}

export interface RideSnapshot {
  pickupZone: ZoneCode;
  dropoffZone: ZoneCode;
  seats: number;
}

export type JoinRefusal =
  'POOL_NOT_JOINABLE' | 'DIFFERENT_PICKUP' | 'NOT_ENOUGH_SEATS' | 'DROPOFF_TOO_FAR';

export type JoinVerdict = { ok: true } | { ok: false; reason: JoinRefusal };

/**
 * Can `ride` join `pool`, given the riders already aboard? All four must hold:
 *   1. the pool hasn't started,  2. same pickup zone,  3. enough free seats,
 *   4. the new drop-off is within MAX_DROPOFF_GAP_KM of every drop-off already aboard.
 * Checking against every rider makes the answer independent of who booked first.
 */
export function canJoin(
  pool: PoolSnapshot,
  ridersAboard: readonly Pick<RideSnapshot, 'dropoffZone'>[],
  ride: RideSnapshot,
): JoinVerdict {
  if (!(JOINABLE_POOL_STATUSES as readonly PoolStatus[]).includes(pool.status)) {
    return { ok: false, reason: 'POOL_NOT_JOINABLE' };
  }
  if (ride.pickupZone !== pool.pickupZone) {
    return { ok: false, reason: 'DIFFERENT_PICKUP' };
  }
  if (pool.capacity - pool.seatsTaken < ride.seats) {
    return { ok: false, reason: 'NOT_ENOUGH_SEATS' };
  }
  const tooFar = ridersAboard.some(
    (rider) => distanceKm(rider.dropoffZone, ride.dropoffZone) > MAX_DROPOFF_GAP_KM,
  );
  if (tooFar) {
    return { ok: false, reason: 'DROPOFF_TOO_FAR' };
  }
  return { ok: true };
}

/** Suggested drop-off order for the driver: nearest to the pickup first. A hint only. */
export function dropOffOrder(pickup: ZoneCode, dropoffs: readonly ZoneCode[]): ZoneCode[] {
  return [...new Set(dropoffs)].sort(
    (a, b) => distanceKm(pickup, a) - distanceKm(pickup, b) || a.localeCompare(b),
  );
}
