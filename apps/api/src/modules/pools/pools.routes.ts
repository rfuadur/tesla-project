import { type Request, Router } from 'express';
import { db } from '../../db/client.js';
import { idParam } from '../../lib/ids.js';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { getDriverVehicle } from '../driver/driver.service.js';
import { dropOff, markArrived, poolViewById, startTrip } from './pools.service.js';

export const poolsRouter = Router();

// Only drivers move trips forward, and only their own (checked when the pool is locked).
poolsRouter.use(requireAuth, requireRole('DRIVER'));

async function driverAndPool(req: Request<{ poolId: string }>) {
  const driverId = currentUser(req).id;
  const vehicle = await getDriverVehicle(db, driverId);
  return { driverId, vehicleId: vehicle.id, poolId: idParam(req.params.poolId, 'Pool not found.') };
}

// POST /api/v1/pools/:poolId/arrive: I'm at the pickup.
poolsRouter.post('/:poolId/arrive', async (req, res) => {
  const { driverId, vehicleId, poolId } = await driverAndPool(req);
  await markArrived(vehicleId, driverId, poolId);
  res.json({ pool: await poolViewById(poolId) });
});

// POST /api/v1/pools/:poolId/start: everyone's aboard, we're going (fares are decided now).
poolsRouter.post('/:poolId/start', async (req, res) => {
  const { driverId, vehicleId, poolId } = await driverAndPool(req);
  await startTrip(vehicleId, driverId, poolId);
  res.json({ pool: await poolViewById(poolId) });
});

// POST /api/v1/pools/:poolId/rides/:rideId/drop-off: this passenger has arrived and paid.
poolsRouter.post('/:poolId/rides/:rideId/drop-off', async (req, res) => {
  const { driverId, vehicleId, poolId } = await driverAndPool(req);
  const rideId = idParam(req.params.rideId, 'That passenger is not in this trip.');
  await dropOff(vehicleId, driverId, poolId, rideId);
  res.json({ pool: await poolViewById(poolId) });
});
