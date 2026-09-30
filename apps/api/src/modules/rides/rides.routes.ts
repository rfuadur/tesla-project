import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '../../lib/errors.js';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { CancelRideBody, CreateRideBody, ListRidesQuery } from './rides.schemas.js';
import { cancelRide, getRide, listRides, requestRide } from './rides.service.js';

export const ridesRouter = Router();

// Every ride route needs a signed-in passenger. Drivers work with pools instead (Phase 8).
ridesRouter.use(requireAuth, requireRole('PASSENGER'));

/** A malformed id can't belong to any ride, so it gets the same 404 as an unknown one. */
function parseRideId(value: string): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw notFound('Ride not found.');
  return parsed.data;
}

// POST /api/v1/rides: book a ride.
ridesRouter.post('/', async (req, res) => {
  const ride = await requestRide(currentUser(req).id, CreateRideBody.parse(req.body));
  res.status(201).json({ ride });
});

// GET /api/v1/rides?scope=active|history: my rides, newest first.
ridesRouter.get('/', async (req, res) => {
  const rides = await listRides(currentUser(req).id, ListRidesQuery.parse(req.query));
  res.json({ rides });
});

// GET /api/v1/rides/:rideId: one of my rides, with its timeline.
ridesRouter.get('/:rideId', async (req, res) => {
  const ride = await getRide(currentUser(req).id, parseRideId(req.params.rideId));
  res.json({ ride });
});

// POST /api/v1/rides/:rideId/cancel: cancel my ride, optionally saying why.
ridesRouter.post('/:rideId/cancel', async (req, res) => {
  const { reason } = CancelRideBody.parse(req.body);
  const ride = await cancelRide(currentUser(req).id, parseRideId(req.params.rideId), reason);
  res.json({ ride });
});
