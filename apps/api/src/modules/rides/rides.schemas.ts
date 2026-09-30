import { z } from 'zod';
import { ZONE_CODES } from '../../domain/geo.js';
import { MAX_SEATS_PER_RIDE } from '../../domain/matching.js';

// POST /api/v1/rides
export const CreateRideBody = z
  .strictObject({
    pickupZone: z.enum(ZONE_CODES),
    dropoffZone: z.enum(ZONE_CODES),
    seats: z.int().min(1).max(MAX_SEATS_PER_RIDE).default(1),
    // TeslaPay is a documented next step; the MVP takes cash only (assumption A12).
    paymentMethod: z.enum(['CASH'], 'only CASH is available for now').default('CASH'),
  })
  .refine((body) => body.pickupZone !== body.dropoffZone, {
    path: ['dropoffZone'],
    message: 'must be a different zone from the pickup',
  });

export type CreateRideInput = z.infer<typeof CreateRideBody>;

// GET /api/v1/rides?scope=active|history&limit=20
export const ListRidesQuery = z.object({
  scope: z.enum(['active', 'history']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// POST /api/v1/rides/:rideId/cancel (the body is optional)
export const CancelRideBody = z
  .strictObject({ reason: z.string().trim().min(1).max(200).optional() })
  .default({});
