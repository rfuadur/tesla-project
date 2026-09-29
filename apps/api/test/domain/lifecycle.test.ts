import { describe, expect, it } from 'vitest';
import { rideStatus, poolStatus } from '../../src/db/schema.js';
import {
  assertPoolTransition,
  assertRideTransition,
  canCancelRide,
  canPoolMove,
  canRideMove,
  POOL_STATUSES,
  RIDE_STATUSES,
} from '../../src/domain/lifecycle.js';
import { AppError } from '../../src/lib/errors.js';

// The complete list of legal moves, written out by hand from docs/domain.md §1.
// The tests below try EVERY from → to pair and check that exactly these are allowed.
const LEGAL_RIDE_MOVES = [
  'REQUESTED → MATCHED',
  'REQUESTED → CANCELLED',
  'MATCHED → DRIVER_ARRIVED',
  'MATCHED → CANCELLED',
  'DRIVER_ARRIVED → STARTED',
  'DRIVER_ARRIVED → CANCELLED',
  'STARTED → COMPLETED',
];

const LEGAL_POOL_MOVES = [
  'ACCEPTED → DRIVER_ARRIVED',
  'ACCEPTED → CANCELLED',
  'DRIVER_ARRIVED → STARTED',
  'DRIVER_ARRIVED → CANCELLED',
  'STARTED → COMPLETED',
];

describe('ride state machine', () => {
  const allPairs = RIDE_STATUSES.flatMap((from) => RIDE_STATUSES.map((to) => ({ from, to })));

  it.each(allPairs)(
    '$from → $to is allowed only if it is in the documented list',
    ({ from, to }) => {
      expect(canRideMove(from, to)).toBe(LEGAL_RIDE_MOVES.includes(`${from} → ${to}`));
    },
  );

  it('rejects an illegal move with 409 INVALID_TRANSITION', () => {
    // e.g. Jashim tries to start Nusrat's ride before arriving at Banani
    const attempt = () => assertRideTransition('MATCHED', 'STARTED');

    expect(attempt).toThrow(AppError);
    expect(attempt).toThrow(expect.objectContaining({ status: 409, code: 'INVALID_TRANSITION' }));
  });

  it('lets a passenger cancel only before the trip starts', () => {
    const cancellable = RIDE_STATUSES.filter(canCancelRide);

    expect(cancellable).toEqual(['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED']);
  });

  it('treats COMPLETED and CANCELLED as final', () => {
    for (const to of RIDE_STATUSES) {
      expect(canRideMove('COMPLETED', to)).toBe(false);
      expect(canRideMove('CANCELLED', to)).toBe(false);
    }
  });
});

describe('pool state machine', () => {
  const allPairs = POOL_STATUSES.flatMap((from) => POOL_STATUSES.map((to) => ({ from, to })));

  it.each(allPairs)(
    '$from → $to is allowed only if it is in the documented list',
    ({ from, to }) => {
      expect(canPoolMove(from, to)).toBe(LEGAL_POOL_MOVES.includes(`${from} → ${to}`));
    },
  );

  it('rejects starting a trip before the driver has arrived', () => {
    expect(() => assertPoolTransition('ACCEPTED', 'STARTED')).toThrow(
      expect.objectContaining({ code: 'INVALID_TRANSITION' }),
    );
  });
});

describe('one vocabulary', () => {
  it('uses the same status names in the database enums as in the state machines', () => {
    expect(rideStatus.enumValues).toEqual([...RIDE_STATUSES]);
    expect(poolStatus.enumValues).toEqual([...POOL_STATUSES]);
  });
});
