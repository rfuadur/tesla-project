import type { Express } from 'express';
import { CAST } from '../../src/db/seed.js';
import { signedInAs } from './auth.js';

// Small helpers so tests read like the story: "Jashim goes online, Nusrat books, Jashim accepts".

export type Client = Awaited<ReturnType<typeof signedInAs>>;

/** Everyone in the story, each signed in with their own cookies. */
export async function signInCast(app: Express) {
  const [jashim, nusrat, rafiq, shirin] = await Promise.all([
    signedInAs(app, CAST.jashim.email),
    signedInAs(app, CAST.nusrat.email),
    signedInAs(app, CAST.rafiq.email),
    signedInAs(app, CAST.shirin.email),
  ]);
  return { jashim, nusrat, rafiq, shirin };
}

export const goOnline = (driver: Client, zone = 'BANANI') =>
  driver.patch('/api/v1/driver/availability').send({ online: true, zone });

/** Books a ride from Banani and returns it (it may already be MATCHED, thanks to auto-join). */
export async function book(passenger: Client, dropoffZone: string, extra: object = {}) {
  const res = await passenger
    .post('/api/v1/rides')
    .send({ pickupZone: 'BANANI', dropoffZone, ...extra });
  if (res.status !== 201)
    throw new Error(`booking failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.ride as { id: string; status: string; pool: { vehicleName: string } | null };
}

export const accept = (driver: Client, rideId: string) =>
  driver.post(`/api/v1/driver/requests/${rideId}/accept`);

export const rideOf = async (passenger: Client, rideId: string) =>
  (await passenger.get(`/api/v1/rides/${rideId}`)).body.ride;
