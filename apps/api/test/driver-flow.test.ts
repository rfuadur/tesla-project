import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { db } from '../src/db/client.js';
import { pool } from '../src/db/pool.js';
import { payments } from '../src/db/schema.js';
import { CAST } from '../src/db/seed.js';
import { signedInAs } from './helpers/auth.js';
import { resetDatabase } from './helpers/db.js';
import { addKamalWithRocket, KAMAL } from './helpers/drivers.js';

const app = buildApp();

afterAll(() => pool.end());

type Client = Awaited<ReturnType<typeof signedInAs>>;
let jashim: Client;
let nusrat: Client;
let rafiq: Client;
let shirin: Client;

beforeEach(async () => {
  await resetDatabase();
  [jashim, nusrat, rafiq, shirin] = await Promise.all([
    signedInAs(app, CAST.jashim.email),
    signedInAs(app, CAST.nusrat.email),
    signedInAs(app, CAST.rafiq.email),
    signedInAs(app, CAST.shirin.email),
  ]);
});

// ── small helpers that read like the story ──
const goOnline = (driver: Client = jashim, zone = 'BANANI') =>
  driver.patch('/api/v1/driver/availability').send({ online: true, zone });

const book = async (passenger: Client, dropoffZone: string, extra: object = {}) => {
  const res = await passenger
    .post('/api/v1/rides')
    .send({ pickupZone: 'BANANI', dropoffZone, ...extra });
  return res.body.ride.id as string;
};

const accept = (rideId: string, driver: Client = jashim) =>
  driver.post(`/api/v1/driver/requests/${rideId}/accept`);

const poolStep = (poolId: string, step: 'arrive' | 'start', driver: Client = jashim) =>
  driver.post(`/api/v1/pools/${poolId}/${step}`);

const dropOff = (poolId: string, rideId: string) =>
  jashim.post(`/api/v1/pools/${poolId}/rides/${rideId}/drop-off`);

const rideOf = async (passenger: Client, rideId: string) =>
  (await passenger.get(`/api/v1/rides/${rideId}`)).body.ride;

/** Jashim online at Banani, with Nusrat (→ Mohakhali) accepted into Bullet's pool. */
async function bulletWithNusrat() {
  await goOnline();
  const nusratRide = await book(nusrat, 'MOHAKHALI');
  const res = await accept(nusratRide);
  return { poolId: res.body.pool.id as string, nusratRide };
}

describe('going online (PATCH /driver/availability)', () => {
  it('puts Jashim and Bullet online at Banani', async () => {
    const res = await goOnline();

    expect(res.status).toBe(200);
    expect(res.body.vehicle).toMatchObject({
      name: 'Bullet',
      isOnline: true,
      currentZone: 'BANANI',
    });
  });

  it('keeps passengers out of driver routes (403)', async () => {
    expect((await goOnline(nusrat)).status).toBe(403);
  });

  it("won't let Jashim go offline in the middle of a trip (409 ACTIVE_POOL_EXISTS)", async () => {
    await bulletWithNusrat();

    const res = await jashim.patch('/api/v1/driver/availability').send({ online: false });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACTIVE_POOL_EXISTS');
  });
});

describe('relevant requests (GET /driver/requests)', () => {
  it('asks Jashim to go online first (409 DRIVER_OFFLINE)', async () => {
    const res = await jashim.get('/api/v1/driver/requests');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DRIVER_OFFLINE');
  });

  it('shows Jashim the rides waiting at Banani, and not rides from other zones', async () => {
    await goOnline();
    await book(nusrat, 'MOHAKHALI');
    await shirin.post('/api/v1/rides').send({ pickupZone: 'GULSHAN_2', dropoffZone: 'GULSHAN_1' });

    const res = await jashim.get('/api/v1/driver/requests');

    expect(res.body.requests).toEqual([
      expect.objectContaining({
        passengerName: 'Nusrat',
        dropoffZone: 'MOHAKHALI',
        fare: expect.objectContaining({ estimatedPaisa: 10_000, pooledPaisa: 7_500 }),
      }),
    ]);
  });

  it('once Nusrat is aboard, shows only waiting riders who fit with her', async () => {
    await goOnline();
    // Rafiq and Shirin book before Bullet has a pool, so there's nothing to auto-join yet: they wait.
    await book(rafiq, 'GULSHAN_1'); // 2 km from Mohakhali: fits
    await book(shirin, 'DHANMONDI'); // 6 km from Mohakhali: doesn't
    await accept(await book(nusrat, 'MOHAKHALI'));

    const res = await jashim.get('/api/v1/driver/requests');

    expect(res.body.requests.map((r: { passengerName: string }) => r.passengerName)).toEqual([
      'Rafiq',
    ]);
  });
});

describe('accepting a ride (POST /driver/requests/:rideId/accept)', () => {
  it("creates Bullet's pool with Nusrat in it, and tells Nusrat who's coming", async () => {
    await goOnline();
    const nusratRide = await book(nusrat, 'MOHAKHALI');

    const res = await accept(nusratRide);

    expect(res.status).toBe(200);
    expect(res.body.pool).toMatchObject({
      status: 'ACCEPTED',
      pickupZone: 'BANANI',
      capacity: 3,
      seatsTaken: 1,
      seatsLeft: 2,
      riders: [{ passengerName: 'Nusrat', status: 'MATCHED', dropoffZone: 'MOHAKHALI' }],
    });

    const ride = await rideOf(nusrat, nusratRide);
    expect(ride.status).toBe('MATCHED');
    expect(ride.pool).toMatchObject({ vehicleName: 'Bullet', driverName: 'Jashim', coRiders: 0 });
    expect(ride.timeline.at(-1)).toMatchObject({ type: 'RIDE_MATCHED', by: 'DRIVER' });
  });

  it('accepts Rafiq (already waiting) into the same pool; Nusrat only learns one other is sharing', async () => {
    await goOnline();
    const rafiqRide = await book(rafiq, 'GULSHAN_1'); // waits: no pool to join yet
    const nusratRide = await book(nusrat, 'MOHAKHALI');
    await accept(nusratRide);

    const res = await accept(rafiqRide);

    expect(res.body.pool.seatsTaken).toBe(2);
    const nusratsView = await rideOf(nusrat, nusratRide);
    expect(nusratsView.pool.coRiders).toBe(1);
    expect(JSON.stringify(nusratsView)).not.toContain('Rafiq');
  });

  it('never lets Bullet carry more than its 3 seats (409 POOL_FULL)', async () => {
    await goOnline();
    await accept(await book(rafiq, 'GULSHAN_1', { seats: 2 })); // Rafiq and a colleague
    await book(nusrat, 'MOHAKHALI'); // auto-joins: the last seat
    const shirinRide = await book(shirin, 'MOHAKHALI'); // auto-join refused: Bullet is full

    const res = await accept(shirinRide);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('POOL_FULL');
    const current = await jashim.get('/api/v1/driver/pool');
    expect(current.body.pool.seatsTaken).toBe(3);
    expect((await rideOf(shirin, shirinRide)).status).toBe('REQUESTED');
  });

  it("refuses a rider whose drop-off is too far from Nusrat's (409 NOT_COMPATIBLE)", async () => {
    await bulletWithNusrat();

    const res = await accept(await book(shirin, 'DHANMONDI'));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_COMPATIBLE');
  });

  it('refuses a ride waiting in another zone (409 WRONG_ZONE)', async () => {
    await goOnline();
    const res = await shirin
      .post('/api/v1/rides')
      .send({ pickupZone: 'GULSHAN_2', dropoffZone: 'GULSHAN_1' });

    const attempt = await accept(res.body.ride.id);

    expect(attempt.status).toBe(409);
    expect(attempt.body.error.code).toBe('WRONG_ZONE');
  });

  it('refuses a ride that is no longer waiting (409 RIDE_NOT_AVAILABLE)', async () => {
    await goOnline();
    const nusratRide = await book(nusrat, 'MOHAKHALI');
    await nusrat.post(`/api/v1/rides/${nusratRide}/cancel`);

    const res = await accept(nusratRide);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RIDE_NOT_AVAILABLE');
  });

  it('lets only one of two drivers win the same ride, even at the same instant', async () => {
    await addKamalWithRocket();
    const kamal = await signedInAs(app, KAMAL.email);
    await goOnline();
    await goOnline(kamal);
    const nusratRide = await book(nusrat, 'MOHAKHALI');

    const [byJashim, byKamal] = await Promise.all([
      accept(nusratRide, jashim),
      accept(nusratRide, kamal),
    ]);

    expect([byJashim.status, byKamal.status].sort()).toEqual([200, 409]);
    const { rows } = await db.execute(
      sql`SELECT count(*)::int AS open FROM pools WHERE status = 'ACCEPTED'`,
    );
    expect(rows[0]).toEqual({ open: 1 }); // the loser's half-made pool was rolled back
  });
});

describe('the trip: arrive → start → drop-off', () => {
  it('runs the story: Nusrat pays ৳75, Rafiq ৳90, Jashim collects ৳165', async () => {
    const { poolId, nusratRide } = await bulletWithNusrat();
    const rafiqRide = await book(rafiq, 'GULSHAN_1'); // two minutes later: auto-joins Bullet
    expect((await rideOf(rafiq, rafiqRide)).status).toBe('MATCHED');

    const arrived = await poolStep(poolId, 'arrive');
    expect(arrived.body.pool.status).toBe('DRIVER_ARRIVED');
    expect((await rideOf(nusrat, nusratRide)).status).toBe('DRIVER_ARRIVED');

    const started = await poolStep(poolId, 'start');
    expect(started.body.pool.status).toBe('STARTED');
    expect(started.body.pool.dropOffOrder).toEqual(['MOHAKHALI', 'GULSHAN_1']);
    expect((await rideOf(nusrat, nusratRide)).fare).toMatchObject({
      discountPaisa: 2_500,
      finalPaisa: 7_500,
    });
    expect((await rideOf(rafiq, rafiqRide)).fare.finalPaisa).toBe(9_000);

    const nusratOff = await dropOff(poolId, nusratRide);
    expect(nusratOff.body.pool.status).toBe('STARTED'); // Rafiq is still riding
    expect((await rideOf(nusrat, nusratRide)).status).toBe('COMPLETED');
    const [payment] = await db.select().from(payments);
    expect(payment).toMatchObject({ method: 'CASH', amountPaisa: 7_500 });

    const rafiqOff = await dropOff(poolId, rafiqRide);
    expect(rafiqOff.body.pool).toMatchObject({ status: 'COMPLETED', collectedPaisa: 16_500 });

    expect(
      (await rideOf(nusrat, nusratRide)).timeline.map((e: { type: string }) => e.type),
    ).toEqual(['RIDE_REQUESTED', 'RIDE_MATCHED', 'DRIVER_ARRIVED', 'TRIP_STARTED', 'DROPPED_OFF']);
    const history = await jashim.get('/api/v1/driver/pools?scope=history');
    expect(history.body.pools[0]).toMatchObject({ id: poolId, collectedPaisa: 16_500 });
  });

  it('charges the full solo fare when nobody shares: Nusrat alone pays ৳100', async () => {
    const { poolId, nusratRide } = await bulletWithNusrat();
    await poolStep(poolId, 'arrive');
    await poolStep(poolId, 'start');

    expect((await rideOf(nusrat, nusratRide)).fare).toMatchObject({
      discountPaisa: 0,
      finalPaisa: 10_000,
    });
  });

  it('boards a rider who books after Jashim has arrived straight away', async () => {
    const { poolId } = await bulletWithNusrat();
    await poolStep(poolId, 'arrive');

    const rafiqRide = await book(rafiq, 'GULSHAN_1'); // auto-joins a Tesla already at the curb

    expect((await rideOf(rafiq, rafiqRide)).status).toBe('DRIVER_ARRIVED');
  });

  it.each([
    ['starting before arriving', 'start'],
    ['arriving twice', 'arrive-twice'],
  ])('rejects %s (409 INVALID_TRANSITION)', async (_label, step) => {
    const { poolId } = await bulletWithNusrat();
    if (step === 'arrive-twice') await poolStep(poolId, 'arrive');

    const res = await poolStep(poolId, step === 'start' ? 'start' : 'arrive');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('rejects a drop-off before the trip has started (409 INVALID_TRANSITION)', async () => {
    const { poolId, nusratRide } = await bulletWithNusrat();

    const res = await dropOff(poolId, nusratRide);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it("keeps other drivers away from Jashim's trip (404), and passengers out (403)", async () => {
    const { poolId } = await bulletWithNusrat();
    await addKamalWithRocket();
    const kamal = await signedInAs(app, KAMAL.email);

    expect((await poolStep(poolId, 'arrive', kamal)).status).toBe(404);
    expect((await poolStep(poolId, 'arrive', nusrat)).status).toBe(403);
  });
});

describe('cancelling a matched ride gives the seats back', () => {
  it('Rafiq cancels after being matched: his seat returns and Nusrat rides on', async () => {
    const { nusratRide } = await bulletWithNusrat();
    const rafiqRide = await book(rafiq, 'GULSHAN_1'); // auto-joins

    const res = await rafiq.post(`/api/v1/rides/${rafiqRide}/cancel`);

    expect(res.status).toBe(200);
    expect((await jashim.get('/api/v1/driver/pool')).body.pool.seatsTaken).toBe(1);
    expect((await rideOf(nusrat, nusratRide)).pool.coRiders).toBe(0);
  });

  it('when the last rider cancels, the empty pool is cancelled and Jashim is free again', async () => {
    const { nusratRide } = await bulletWithNusrat();

    await nusrat.post(`/api/v1/rides/${nusratRide}/cancel`);

    expect((await jashim.get('/api/v1/driver/pool')).body.pool).toBeNull();
    expect((await jashim.patch('/api/v1/driver/availability').send({ online: false })).status).toBe(
      200,
    );
  });

  it('still lets a rider cancel after Jashim has arrived', async () => {
    const { poolId, nusratRide } = await bulletWithNusrat();
    await poolStep(poolId, 'arrive');

    expect((await nusrat.post(`/api/v1/rides/${nusratRide}/cancel`)).status).toBe(200);
  });

  it('records the returned seats in the history', async () => {
    const { nusratRide } = await bulletWithNusrat();

    await nusrat.post(`/api/v1/rides/${nusratRide}/cancel`);

    const [cancelled] = await db
      .select()
      .from(payments)
      .where(eq(payments.rideRequestId, nusratRide));
    expect(cancelled).toBeUndefined(); // no payment for a cancelled ride
    expect((await rideOf(nusrat, nusratRide)).timeline.at(-1)).toMatchObject({
      type: 'RIDE_CANCELLED',
      fromStatus: 'MATCHED',
      details: { seatsReleased: 1 },
    });
  });
});
