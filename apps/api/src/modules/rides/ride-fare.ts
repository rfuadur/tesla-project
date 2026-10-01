import type { rideRequests } from '../../db/schema.js';
import { type FareRuleVersion, quoteFare } from '../../domain/fare.js';

type FareColumns = Pick<
  typeof rideRequests.$inferSelect,
  | 'distanceKm'
  | 'seats'
  | 'fareRuleVersion'
  | 'estimatedFarePaisa'
  | 'poolDiscountPaisa'
  | 'finalFarePaisa'
>;

/** A ride's money, as shown to its passenger and its driver. Amounts stay in paisa. */
export function rideFare(ride: FareColumns) {
  // Rides only ever store versions that exist in FARE_RULES.
  const ruleVersion = ride.fareRuleVersion as FareRuleVersion;
  const pooled = quoteFare({
    distanceKm: ride.distanceKm,
    seats: ride.seats,
    shared: true,
    ruleVersion,
  });

  return {
    ruleVersion,
    estimatedPaisa: ride.estimatedFarePaisa, // solo price: the most this ride can cost
    pooledPaisa: pooled.totalPaisa, // the price if the trip starts shared
    discountPaisa: ride.poolDiscountPaisa, // decided when the trip starts
    finalPaisa: ride.finalFarePaisa,
  };
}
