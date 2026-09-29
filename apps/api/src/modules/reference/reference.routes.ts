import { Router } from 'express';
import { z } from 'zod';
import { quoteFare } from '../../domain/fare.js';
import { distanceKm, ZONE_CODES, ZONES } from '../../domain/geo.js';
import { MAX_SEATS_PER_RIDE } from '../../domain/matching.js';

// Public reference data: no sign-in needed to see the zones or price a trip.
export const referenceRouter = Router();

// GET /api/v1/zones
referenceRouter.get('/zones', (_req, res) => {
  res.json({ zones: ZONES.map(({ code, name, lat, lng }) => ({ code, name, lat, lng })) });
});

const EstimateQuery = z
  .object({
    pickup: z.enum(ZONE_CODES),
    dropoff: z.enum(ZONE_CODES),
    seats: z.coerce.number().int().min(1).max(MAX_SEATS_PER_RIDE).default(1),
  })
  .refine((query) => query.pickup !== query.dropoff, {
    path: ['dropoff'],
    message: 'must be a different zone from the pickup',
  });

// GET /api/v1/fares/estimate?pickup=BANANI&dropoff=MOHAKHALI&seats=1
// Shows both prices: solo (the most you will pay) and pooled (if the trip starts shared).
referenceRouter.get('/fares/estimate', (req, res) => {
  const { pickup, dropoff, seats } = EstimateQuery.parse(req.query);
  const km = distanceKm(pickup, dropoff);

  res.json({
    estimate: {
      pickupZone: pickup,
      dropoffZone: dropoff,
      distanceKm: km,
      seats,
      solo: quoteFare({ distanceKm: km, seats, shared: false }),
      pooled: quoteFare({ distanceKm: km, seats, shared: true }),
    },
  });
});
