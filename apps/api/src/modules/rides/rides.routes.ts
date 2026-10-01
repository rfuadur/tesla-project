import { Router } from 'express';
import { idParam } from '../../lib/ids.js';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { CancelRideBody, CreateRideBody, ListRidesQuery } from './rides.schemas.js';
import { cancelRide, getRide, listRides, requestRide } from './rides.service.js';

export const ridesRouter = Router();

// Every ride route needs a signed-in passenger. Drivers work with pools instead.
ridesRouter.use(requireAuth, requireRole('PASSENGER'));

const rideIdParam = (value: string) => idParam(value, 'Ride not found.');

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
  const ride = await getRide(currentUser(req).id, rideIdParam(req.params.rideId));
  res.json({ ride });
});

// POST /api/v1/rides/:rideId/cancel: cancel my ride, optionally saying why.
ridesRouter.post('/:rideId/cancel', async (req, res) => {
  const { reason } = CancelRideBody.parse(req.body);
  const ride = await cancelRide(currentUser(req).id, rideIdParam(req.params.rideId), reason);
  res.json({ ride });
});
