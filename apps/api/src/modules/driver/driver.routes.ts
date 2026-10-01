import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { ZONE_CODES } from '../../domain/geo.js';
import { idParam } from '../../lib/ids.js';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { poolHistory } from '../pools/pools.service.js';
import {
  acceptRide,
  currentPool,
  getDriverVehicle,
  relevantRequests,
  setAvailability,
} from './driver.service.js';

export const driverRouter = Router();

// Every driver route needs a signed-in driver.
driverRouter.use(requireAuth, requireRole('DRIVER'));

const AvailabilityBody = z.strictObject({
  online: z.boolean(),
  zone: z.enum(ZONE_CODES).optional(), // defaults to where the Tesla already is
});

const HistoryQuery = z.object({
  scope: z.literal('history').default('history'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// PATCH /api/v1/driver/availability: go online in a zone, or offline.
driverRouter.patch('/availability', async (req, res) => {
  const vehicle = await setAvailability(currentUser(req).id, AvailabilityBody.parse(req.body));
  res.json({ vehicle });
});

// GET /api/v1/driver/requests: waiting rides that fit my Tesla right now.
driverRouter.get('/requests', async (req, res) => {
  res.json({ requests: await relevantRequests(currentUser(req).id) });
});

// POST /api/v1/driver/requests/:rideId/accept: take the ride into my current trip (creating it if needed).
driverRouter.post('/requests/:rideId/accept', async (req, res) => {
  const rideId = idParam(req.params.rideId, 'Ride not found.');
  res.json({ pool: await acceptRide(currentUser(req).id, rideId) });
});

// GET /api/v1/driver/pool: my trip in progress, or null.
driverRouter.get('/pool', async (req, res) => {
  res.json({ pool: await currentPool(currentUser(req).id) });
});

// GET /api/v1/driver/pools?scope=history: my finished trips.
driverRouter.get('/pools', async (req, res) => {
  const { limit } = HistoryQuery.parse(req.query);
  const vehicle = await getDriverVehicle(db, currentUser(req).id);
  res.json({ pools: await poolHistory(vehicle.id, limit) });
});
