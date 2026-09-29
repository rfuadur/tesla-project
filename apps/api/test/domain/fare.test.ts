import { describe, expect, it } from 'vitest';
import { quoteFare } from '../../src/domain/fare.js';
import { distanceKm, ZONE_CODES } from '../../src/domain/geo.js';

// The hand-check from docs/domain.md §3: an evaluator can redo every number with a calculator.
describe('fare rule v1: ৳40 base + ৳20 per km, per seat; 25 % off when shared', () => {
  it('prices Nusrat (Banani → Mohakhali, 3 km): ৳100 solo, ৳75 pooled', () => {
    const solo = quoteFare({ distanceKm: 3, seats: 1, shared: false });
    const pooled = quoteFare({ distanceKm: 3, seats: 1, shared: true });

    expect(solo).toMatchObject({
      baseFarePaisa: 4_000, // ৳40
      distanceChargePaisa: 6_000, // 3 × ৳20
      subtotalPaisa: 10_000,
      poolDiscountPaisa: 0,
      totalPaisa: 10_000, // ৳100
    });
    expect(pooled.poolDiscountPaisa).toBe(2_500); // 25 % of ৳100
    expect(pooled.totalPaisa).toBe(7_500); // ৳75
  });

  it('prices Rafiq (Banani → Gulshan 1, 4 km): ৳120 solo, ৳90 pooled', () => {
    expect(quoteFare({ distanceKm: 4, seats: 1, shared: false }).totalPaisa).toBe(12_000);
    expect(quoteFare({ distanceKm: 4, seats: 1, shared: true }).totalPaisa).toBe(9_000);
  });

  it('pays Jashim ৳165 for the shared trip, more than either solo fare', () => {
    const nusrat = quoteFare({ distanceKm: 3, seats: 1, shared: true });
    const rafiq = quoteFare({ distanceKm: 4, seats: 1, shared: true });

    expect(nusrat.totalPaisa + rafiq.totalPaisa).toBe(16_500);
  });

  it('charges per seat: Rafiq and a colleague pay ৳240 solo, ৳180 shared', () => {
    expect(quoteFare({ distanceKm: 4, seats: 2, shared: false }).totalPaisa).toBe(24_000);
    expect(quoteFare({ distanceKm: 4, seats: 2, shared: true }).totalPaisa).toBe(18_000);
  });

  it('records which rule priced the ride, so old rides stay explainable after a price change', () => {
    expect(quoteFare({ distanceKm: 3, seats: 1, shared: false }).ruleVersion).toBe('v1');
  });

  it('always gives whole paisa, and a pooled fare never above the solo fare, for every trip', () => {
    for (const from of ZONE_CODES) {
      for (const to of ZONE_CODES) {
        if (from === to) continue;
        for (const seats of [1, 2, 3]) {
          const km = distanceKm(from, to);
          const solo = quoteFare({ distanceKm: km, seats, shared: false });
          const pooled = quoteFare({ distanceKm: km, seats, shared: true });

          expect(Number.isInteger(pooled.totalPaisa)).toBe(true);
          expect(pooled.totalPaisa).toBeLessThanOrEqual(solo.totalPaisa);
        }
      }
    }
  });

  it('refuses impossible input instead of inventing a price', () => {
    expect(() => quoteFare({ distanceKm: 0, seats: 1, shared: false })).toThrow(RangeError);
    expect(() => quoteFare({ distanceKm: 2.5, seats: 1, shared: false })).toThrow(RangeError);
    expect(() => quoteFare({ distanceKm: 3, seats: 0, shared: false })).toThrow(RangeError);
  });
});
