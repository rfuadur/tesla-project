// The fare model from docs/domain.md §3. Pure arithmetic in integer paisa (1 taka = 100 paisa).
//
//   subtotal     = (base fare + per-km charge × km) × seats
//   poolDiscount = shared ? 25 % of subtotal : 0
//   fare         = subtotal − poolDiscount

/**
 * Fare rules by version. Each ride stores the version it was priced with, so a price change later
 * (a "v2") never changes what an old ride cost or how it is explained.
 */
export const FARE_RULES = {
  v1: {
    baseFarePaisa: 4_000, // ৳40 per seat
    perKmPaisa: 2_000, // ৳20 per km per seat
    poolDiscountBps: 2_500, // 25 %, in basis points (1 bp = 0.01 %) so the math stays in integers
  },
} as const;

export type FareRuleVersion = keyof typeof FARE_RULES;
export const CURRENT_FARE_RULE: FareRuleVersion = 'v1';

export interface FareQuote {
  ruleVersion: FareRuleVersion;
  distanceKm: number;
  seats: number;
  baseFarePaisa: number;
  distanceChargePaisa: number;
  subtotalPaisa: number;
  poolDiscountPaisa: number;
  totalPaisa: number;
}

export function quoteFare(input: {
  distanceKm: number;
  seats: number;
  shared: boolean;
  ruleVersion?: FareRuleVersion;
}): FareQuote {
  const { distanceKm, seats, shared, ruleVersion = CURRENT_FARE_RULE } = input;
  if (!Number.isInteger(distanceKm) || distanceKm <= 0) {
    throw new RangeError(`distanceKm must be a positive whole number, got ${distanceKm}`);
  }
  if (!Number.isInteger(seats) || seats < 1) {
    throw new RangeError(`seats must be a positive whole number, got ${seats}`);
  }

  const rule = FARE_RULES[ruleVersion];
  const baseFarePaisa = rule.baseFarePaisa * seats;
  const distanceChargePaisa = rule.perKmPaisa * distanceKm * seats;
  const subtotalPaisa = baseFarePaisa + distanceChargePaisa;
  // Rounded down to the paisa. With v1's numbers the discount is always a whole multiple of ৳5.
  const poolDiscountPaisa = shared
    ? Math.floor((subtotalPaisa * rule.poolDiscountBps) / 10_000)
    : 0;

  return {
    ruleVersion,
    distanceKm,
    seats,
    baseFarePaisa,
    distanceChargePaisa,
    subtotalPaisa,
    poolDiscountPaisa,
    totalPaisa: subtotalPaisa - poolDiscountPaisa,
  };
}
