import { describe, expect, it } from 'vitest';
import type { ZoneCode } from '../../src/domain/geo.js';
import { canJoin, dropOffOrder, type PoolSnapshot } from '../../src/domain/matching.js';

// Bullet waiting at Banani. Seats and riders vary per test.
const bulletAtBanani = (seatsTaken: number, status: PoolSnapshot['status'] = 'ACCEPTED') => ({
  status,
  pickupZone: 'BANANI' as const,
  capacity: 3,
  seatsTaken,
});

const aboard = (...dropoffs: ZoneCode[]) => dropoffs.map((dropoffZone) => ({ dropoffZone }));

const fromBanani = (dropoffZone: ZoneCode, seats = 1) => ({
  pickupZone: 'BANANI' as const,
  dropoffZone,
  seats,
});

describe('matching rule: same pickup, drop-offs ≤ 3 km apart, enough seats, not started', () => {
  it("lets Rafiq (→ Gulshan 1) join Nusrat's pool (→ Mohakhali): drop-offs 2 km apart", () => {
    expect(canJoin(bulletAtBanani(1), aboard('MOHAKHALI'), fromBanani('GULSHAN_1'))).toEqual({
      ok: true,
    });
  });

  it('gives the same answer whoever booked first', () => {
    expect(canJoin(bulletAtBanani(1), aboard('GULSHAN_1'), fromBanani('MOHAKHALI'))).toEqual({
      ok: true,
    });
  });

  it('lets Shirin (→ Mohakhali) take the last seat', () => {
    const verdict = canJoin(
      bulletAtBanani(2),
      aboard('MOHAKHALI', 'GULSHAN_1'),
      fromBanani('MOHAKHALI'),
    );

    expect(verdict).toEqual({ ok: true });
  });

  it('refuses Shirin → Tejgaon: 2 km from Mohakhali but 4 km from Gulshan 1', () => {
    const verdict = canJoin(
      bulletAtBanani(2),
      aboard('MOHAKHALI', 'GULSHAN_1'),
      fromBanani('TEJGAON'),
    );

    expect(verdict).toEqual({ ok: false, reason: 'DROPOFF_TOO_FAR' });
  });

  it('refuses Shirin → Dhanmondi: 6 km from Mohakhali', () => {
    expect(canJoin(bulletAtBanani(1), aboard('MOHAKHALI'), fromBanani('DHANMONDI'))).toEqual({
      ok: false,
      reason: 'DROPOFF_TOO_FAR',
    });
  });

  it('refuses Shirin and her sister (2 seats) when only 1 seat is left', () => {
    const verdict = canJoin(
      bulletAtBanani(2),
      aboard('MOHAKHALI', 'GULSHAN_1'),
      fromBanani('MOHAKHALI', 2),
    );

    expect(verdict).toEqual({ ok: false, reason: 'NOT_ENOUGH_SEATS' });
  });

  it('refuses a ride from a different pickup zone', () => {
    const fromGulshan2 = {
      pickupZone: 'GULSHAN_2' as const,
      dropoffZone: 'MOHAKHALI' as const,
      seats: 1,
    };

    expect(canJoin(bulletAtBanani(1), aboard('MOHAKHALI'), fromGulshan2)).toEqual({
      ok: false,
      reason: 'DIFFERENT_PICKUP',
    });
  });

  it('refuses to add riders once the trip has started', () => {
    expect(
      canJoin(bulletAtBanani(1, 'STARTED'), aboard('MOHAKHALI'), fromBanani('GULSHAN_1')),
    ).toEqual({ ok: false, reason: 'POOL_NOT_JOINABLE' });
  });

  it('still accepts riders after the driver has arrived (they board at the same curb)', () => {
    expect(
      canJoin(bulletAtBanani(1, 'DRIVER_ARRIVED'), aboard('MOHAKHALI'), fromBanani('GULSHAN_1')),
    ).toEqual({ ok: true });
  });
});

describe('drop-off order hint', () => {
  it('suggests Mohakhali (3 km) before Gulshan 1 (4 km) from Banani, listing each stop once', () => {
    expect(dropOffOrder('BANANI', ['GULSHAN_1', 'MOHAKHALI', 'MOHAKHALI'])).toEqual([
      'MOHAKHALI',
      'GULSHAN_1',
    ]);
  });
});
