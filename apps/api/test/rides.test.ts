import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { db } from '../src/db/client.js';
import { pool } from '../src/db/pool.js';
import { pools, rideRequests } from '../src/db/schema.js';
import { CAST } from '../src/db/seed.js';
import { signedInAs } from './helpers/auth.js';
import { type Cast, loadCast, resetDatabase } from './helpers/db.js';

const app = buildApp();

afterAll(() => pool.end());

type Client = Awaited<ReturnType<typeof signedInAs>>;
let cast: Cast;
let nusrat: Client;
let rafiq: Client;

beforeEach(async () => {
  await resetDatabase();
  cast = await loadCast();
  nusrat = await signedInAs(app, CAST.nusrat.email);
  rafiq = await signedInAs(app, CAST.rafiq.email);
});

const bananiToMohakhali = { pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI' };

const book = (client: Client, body: object = bananiToMohakhali) =>
  client.post('/api/v1/rides').send(body);

describe('booking a ride (POST /rides)', () => {
  it('books Nusrat Banani → Mohakhali: waiting for a Tesla, ৳100 estimate, ৳75 if pooled', async () => {
    const res = await book(nusrat);

    expect(res.status).toBe(201);
    expect(res.body.ride).toMatchObject({
      status: 'REQUESTED',
      pickupZone: 'BANANI',
      dropoffZone: 'MOHAKHALI',
      seats: 1,
      paymentMethod: 'CASH',
      distanceKm: 3,
      fare: {
        ruleVersion: 'v1',
        estimatedPaisa: 10_000,
        pooledPaisa: 7_500,
        discountPaisa: null,
        finalPaisa: null,
      },
      pool: null,
    });
  });

  it("starts the ride's timeline with the booking", async () => {
    const res = await book(nusrat);

    expect(res.body.ride.timeline).toEqual([
      expect.objectContaining({
        type: 'RIDE_REQUESTED',
        fromStatus: null,
        toStatus: 'REQUESTED',
        by: 'PASSENGER',
      }),
    ]);
  });

  it('refuses a second active ride for the same passenger (409 ACTIVE_RIDE_EXISTS)', async () => {
    await book(nusrat);

    const second = await book(nusrat, { pickupZone: 'BANANI', dropoffZone: 'GULSHAN_1' });

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ACTIVE_RIDE_EXISTS');
  });

  it('books only once when Nusrat double-clicks "Request"', async () => {
    const [first, second] = await Promise.all([book(nusrat), book(nusrat)]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const [{ rides }] = (await db.execute(sql`SELECT count(*)::int AS rides FROM ride_requests`))
      .rows as [{ rides: number }];
    expect(rides).toBe(1);
  });

  it.each([
    ['the same pickup and drop-off', { pickupZone: 'BANANI', dropoffZone: 'BANANI' }],
    ['more than 3 seats', { ...bananiToMohakhali, seats: 4 }],
    ['TeslaPay (cash only for now)', { ...bananiToMohakhali, paymentMethod: 'TESLAPAY' }],
    ['a zone that does not exist', { pickupZone: 'BANANI', dropoffZone: 'NARNIA' }],
    ['a field the API does not know', { ...bananiToMohakhali, fare: 1 }],
  ])('rejects %s with 400 VALIDATION_ERROR', async (_label, body) => {
    const res = await book(nusrat, body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('does not let Jashim (a driver) book rides (403)', async () => {
    const jashim = await signedInAs(app, CAST.jashim.email);

    expect((await book(jashim)).status).toBe(403);
  });

  it('asks for sign-in first (401)', async () => {
    expect((await request(app).post('/api/v1/rides').send(bananiToMohakhali)).status).toBe(401);
  });
});

describe('viewing rides (GET /rides, GET /rides/:id)', () => {
  it("lists Nusrat's active ride, and moves it to her history once cancelled", async () => {
    const { body } = await book(nusrat);

    const active = await nusrat.get('/api/v1/rides?scope=active');
    expect(active.body.rides.map((ride: { id: string }) => ride.id)).toEqual([body.ride.id]);

    await nusrat.post(`/api/v1/rides/${body.ride.id}/cancel`);

    expect((await nusrat.get('/api/v1/rides?scope=active')).body.rides).toEqual([]);
    expect((await nusrat.get('/api/v1/rides?scope=history')).body.rides).toHaveLength(1);
  });

  it("never shows Nusrat's ride to Rafiq: 404, exactly like a ride that doesn't exist", async () => {
    const { body } = await book(nusrat);

    const peek = await rafiq.get(`/api/v1/rides/${body.ride.id}`);

    expect(peek.status).toBe(404);
    expect(peek.body.error.code).toBe('NOT_FOUND');
    expect((await rafiq.get('/api/v1/rides')).body.rides).toEqual([]);
  });

  it('answers 404 for an id that is not even a valid ride id', async () => {
    expect((await nusrat.get('/api/v1/rides/not-a-real-id')).status).toBe(404);
  });
});

describe('cancelling (POST /rides/:id/cancel)', () => {
  it('lets Nusrat cancel while she is still waiting, and records why', async () => {
    const { body } = await book(nusrat);

    const res = await nusrat
      .post(`/api/v1/rides/${body.ride.id}/cancel`)
      .send({ reason: 'Found a CNG instead' });

    expect(res.status).toBe(200);
    expect(res.body.ride).toMatchObject({
      status: 'CANCELLED',
      cancelReason: 'Found a CNG instead',
      cancelledAt: expect.any(String),
    });
    expect(res.body.ride.timeline.map((event: { type: string }) => event.type)).toEqual([
      'RIDE_REQUESTED',
      'RIDE_CANCELLED',
    ]);
  });

  it("won't let Rafiq cancel Nusrat's ride, and leaves her ride untouched", async () => {
    const { body } = await book(nusrat);

    const attempt = await rafiq.post(`/api/v1/rides/${body.ride.id}/cancel`);

    expect(attempt.status).toBe(404);
    expect((await nusrat.get(`/api/v1/rides/${body.ride.id}`)).body.ride.status).toBe('REQUESTED');
  });

  it('refuses to cancel the same ride twice (409 INVALID_TRANSITION)', async () => {
    const { body } = await book(nusrat);
    await nusrat.post(`/api/v1/rides/${body.ride.id}/cancel`);

    const again = await nusrat.post(`/api/v1/rides/${body.ride.id}/cancel`);

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('lets Nusrat book again after cancelling', async () => {
    const { body } = await book(nusrat);
    await nusrat.post(`/api/v1/rides/${body.ride.id}/cancel`);

    expect((await book(nusrat)).status).toBe(201);
  });

  it('refuses to cancel once the trip has started (409 INVALID_TRANSITION)', async () => {
    // The driver flow arrives in Phase 8, so put Nusrat into a trip that has already started directly.
    const [trip] = await db
      .insert(pools)
      .values({
        vehicleId: cast.bullet.id,
        pickupZoneCode: 'BANANI',
        capacity: 3,
        seatsTaken: 1,
        status: 'STARTED',
      })
      .returning();
    const [ride] = await db
      .insert(rideRequests)
      .values({
        passengerId: cast.nusrat.id,
        poolId: trip!.id,
        status: 'STARTED',
        pickupZoneCode: 'BANANI',
        dropoffZoneCode: 'MOHAKHALI',
        seats: 1,
        distanceKm: 3,
        fareRuleVersion: 'v1',
        estimatedFarePaisa: 10_000,
      })
      .returning();

    const res = await nusrat.post(`/api/v1/rides/${ride!.id}/cancel`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });
});
