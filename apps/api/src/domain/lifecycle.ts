import { conflict } from '../lib/errors.js';

// The two linked state machines from docs/domain.md §1.
// A ride is one passenger's journey; a pool is one Tesla trip carrying one or more rides.
// The database enums are built from these lists, so the vocabulary lives in exactly one place.

export const RIDE_STATUSES = [
  'REQUESTED',
  'MATCHED',
  'DRIVER_ARRIVED',
  'STARTED',
  'COMPLETED',
  'CANCELLED',
] as const;
export type RideStatus = (typeof RIDE_STATUSES)[number];

export const POOL_STATUSES = [
  'ACCEPTED',
  'DRIVER_ARRIVED',
  'STARTED',
  'COMPLETED',
  'CANCELLED',
] as const;
export type PoolStatus = (typeof POOL_STATUSES)[number];

/** Every move a ride may make. Anything not listed here is illegal. */
export const RIDE_TRANSITIONS: Record<RideStatus, readonly RideStatus[]> = {
  REQUESTED: ['MATCHED', 'CANCELLED'],
  MATCHED: ['DRIVER_ARRIVED', 'CANCELLED'],
  DRIVER_ARRIVED: ['STARTED', 'CANCELLED'],
  STARTED: ['COMPLETED'], // once moving, a ride can only finish: no cancelling mid-trip
  COMPLETED: [],
  CANCELLED: [],
};

/** Every move a pool may make. */
export const POOL_TRANSITIONS: Record<PoolStatus, readonly PoolStatus[]> = {
  ACCEPTED: ['DRIVER_ARRIVED', 'CANCELLED'],
  DRIVER_ARRIVED: ['STARTED', 'CANCELLED'],
  STARTED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const canRideMove = (from: RideStatus, to: RideStatus): boolean =>
  RIDE_TRANSITIONS[from].includes(to);

export const canPoolMove = (from: PoolStatus, to: PoolStatus): boolean =>
  POOL_TRANSITIONS[from].includes(to);

/** Throws 409 INVALID_TRANSITION unless the ride may move from `from` to `to`. */
export function assertRideTransition(from: RideStatus, to: RideStatus): void {
  if (!canRideMove(from, to)) {
    throw conflict('INVALID_TRANSITION', `A ride cannot go from ${from} to ${to}.`, { from, to });
  }
}

/** Throws 409 INVALID_TRANSITION unless the pool may move from `from` to `to`. */
export function assertPoolTransition(from: PoolStatus, to: PoolStatus): void {
  if (!canPoolMove(from, to)) {
    throw conflict('INVALID_TRANSITION', `A pool cannot go from ${from} to ${to}.`, { from, to });
  }
}

/** A ride is "active" until it is completed or cancelled (matches the one-active-ride index). */
export const ACTIVE_RIDE_STATUSES = [
  'REQUESTED',
  'MATCHED',
  'DRIVER_ARRIVED',
  'STARTED',
] as const satisfies readonly RideStatus[];

/** New riders can join a pool until it starts (assumption A7). */
export const JOINABLE_POOL_STATUSES = [
  'ACCEPTED',
  'DRIVER_ARRIVED',
] as const satisfies readonly PoolStatus[];

/** A passenger may cancel while the ride can still move to CANCELLED, i.e. before the trip starts. */
export const canCancelRide = (status: RideStatus): boolean => canRideMove(status, 'CANCELLED');
