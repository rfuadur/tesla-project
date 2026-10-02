import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { signedInAs } from './helpers/auth.js';
import { resetDatabase } from './helpers/db.js';
import { addKamalWithRocket, KAMAL } from './helpers/drivers.js';
import { accept, book, type Client, goOnline, rideOf, signInCast } from './helpers/story.js';

// Auto-join: "The app now has to figure out, in about a second, whether these two can share a seat."

const app = buildApp();

afterAll(() => pool.end());

let jashim: Client;
let nusrat: Client;
let rafiq: Client;
let shirin: Client;

beforeEach(async () => {
  await resetDatabase();
  ({ jashim, nusrat, rafiq, shirin } = await signInCast(app));
});

/** 08:41: Jashim online at Banani, Nusrat (→ Mohakhali) accepted into Bullet's pool. */
async function bulletWithNusrat() {
  await goOnline(jashim);
  const nusratRide = await book(nusrat, 'MOHAKHALI');
  const res = await accept(jashim, nusratRide.id);
  return { poolId: res.body.pool.id as string, nusratRide: nusratRide.id };
}

describe('auto-join when booking', () => {
  it('puts Rafiq (→ Gulshan 1) into Bullet the moment he books, matched by the system', async () => {
    await bulletWithNusrat();

    const rafiqRide = await book(rafiq, 'GULSHAN_1');

    expect(rafiqRide.status).toBe('MATCHED');
    expect(rafiqRide.pool).toMatchObject({ vehicleName: 'Bullet', coRiders: 1, seatsLeft: 1 });
    expect((await rideOf(rafiq, rafiqRide.id)).timeline.at(-1)).toMatchObject({
      type: 'RIDE_MATCHED',
      by: 'SYSTEM',
      details: { via: 'AUTO_JOIN' },
    });
  });

  it('gives Shirin (→ Mohakhali) the last seat: Bullet is full', async () => {
    await bulletWithNusrat();
    await book(rafiq, 'GULSHAN_1');

    const shirinRide = await book(shirin, 'MOHAKHALI');

    expect(shirinRide.status).toBe('MATCHED');
    expect((await jashim.get('/api/v1/driver/pool')).body.pool).toMatchObject({
      seatsTaken: 3,
      seatsLeft: 0,
    });
  });

  it('leaves Shirin (→ Tejgaon) waiting, and her timeline explains why', async () => {
    await bulletWithNusrat();
    await book(rafiq, 'GULSHAN_1');

    const shirinRide = await book(shirin, 'TEJGAON'); // 2 km from Mohakhali, but 4 km from Gulshan 1

    expect(shirinRide.status).toBe('REQUESTED');
    expect((await rideOf(shirin, shirinRide.id)).timeline.at(-1)).toMatchObject({
      type: 'SEAT_CLAIM_REJECTED',
      by: 'SYSTEM',
      details: { reason: 'DROPOFF_TOO_FAR' },
    });
  });

  it('does not squeeze Shirin and her sister (2 seats) into the last seat', async () => {
    await bulletWithNusrat();
    await book(rafiq, 'GULSHAN_1');

    const shirinRide = await book(shirin, 'MOHAKHALI', { seats: 2 });

    expect(shirinRide.status).toBe('REQUESTED');
  });

  it('never adds anyone to a trip that has already started', async () => {
    const { poolId } = await bulletWithNusrat();
    await jashim.post(`/api/v1/pools/${poolId}/arrive`);
    await jashim.post(`/api/v1/pools/${poolId}/start`);

    expect((await book(rafiq, 'GULSHAN_1')).status).toBe('REQUESTED');
  });

  it('fills the Tesla that has been waiting longest first', async () => {
    await addKamalWithRocket();
    const kamal = await signedInAs(app, KAMAL.email);
    await goOnline(jashim);
    await goOnline(kamal);
    // Nusrat and Shirin both book before any Tesla has a trip, so both wait...
    const nusratRide = await book(nusrat, 'MOHAKHALI');
    const shirinRide = await book(shirin, 'MOHAKHALI');
    // ...then Jashim opens his trip first, and Kamal a moment later.
    await accept(jashim, nusratRide.id);
    await accept(kamal, shirinRide.id);

    const rafiqRide = await book(rafiq, 'GULSHAN_1'); // fits both Teslas

    expect(rafiqRide.pool?.vehicleName).toBe('Bullet');
  });
});
