import { describe, expect, it } from 'vitest';
import { distanceKm, ZONE_CODES } from '../../src/domain/geo.js';

describe('road-distance table', () => {
  it('has the story distances', () => {
    expect(distanceKm('BANANI', 'MOHAKHALI')).toBe(3); // Nusrat
    expect(distanceKm('BANANI', 'GULSHAN_1')).toBe(4); // Rafiq
    expect(distanceKm('MOHAKHALI', 'GULSHAN_1')).toBe(2); // why they can share
  });

  it('is symmetric, and zero only from a zone to itself', () => {
    for (const a of ZONE_CODES) {
      for (const b of ZONE_CODES) {
        expect(distanceKm(a, b)).toBe(distanceKm(b, a));
        if (a === b) expect(distanceKm(a, b)).toBe(0);
        else expect(distanceKm(a, b)).toBeGreaterThan(0);
      }
    }
  });

  // If a detour through a third zone were shorter than the direct trip, the table would contradict
  // itself, and the matching rule's detour guarantee would no longer hold.
  it('never makes a detour through a third zone shorter than the direct trip (triangle rule)', () => {
    for (const a of ZONE_CODES) {
      for (const b of ZONE_CODES) {
        for (const c of ZONE_CODES) {
          expect(distanceKm(a, c)).toBeLessThanOrEqual(distanceKm(a, b) + distanceKm(b, c));
        }
      }
    }
  });
});
