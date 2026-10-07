import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { db } from '../src/db/client.js';
import { pool } from '../src/db/pool.js';
import { users } from '../src/db/schema.js';
import { CAST, DEMO_PASSWORD } from '../src/db/seed.js';
import { SESSION_COOKIE, signSessionToken } from '../src/lib/session.js';
import { requireAuth, requireRole } from '../src/middleware/auth.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { signedInAs } from './helpers/auth.js';
import { type Cast, loadCast, resetDatabase } from './helpers/db.js';

const app = buildApp();

afterAll(() => pool.end());

describe('sign-up (POST /auth/register)', () => {
  // Shirin is new to the app, so this world has zones but no cast yet.
  beforeEach(() => resetDatabase({ withCast: false }));

  const shirin = { fullName: 'Shirin', email: 'Shirin@TeslaPool.test', password: DEMO_PASSWORD };

  it('signs Shirin up as a passenger and signs her in straight away', async () => {
    const res = await request(app).post('/api/v1/auth/register').send(shirin);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      fullName: 'Shirin',
      email: 'shirin@teslapool.test', // stored lower-case
      role: 'PASSENGER',
    });
    expect(res.body.user).not.toHaveProperty('passwordHash');

    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('stores only a bcrypt hash of her password, never the password itself', async () => {
    await request(app).post('/api/v1/auth/register').send(shirin);

    const [row] = await db.select().from(users).where(eq(users.email, 'shirin@teslapool.test'));
    expect(row?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(row?.passwordHash).not.toContain(DEMO_PASSWORD);
  });

  it('refuses a second account with the same email, whatever its letter case (409)', async () => {
    await request(app).post('/api/v1/auth/register').send(shirin);

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...shirin, email: 'SHIRIN@teslapool.test' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('explains which fields are invalid (400)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ fullName: '', email: 'not-an-email', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = res.body.error.details.map((issue: { path: string }) => issue.path);
    expect(fields).toEqual(expect.arrayContaining(['fullName', 'email', 'password']));
  });

  it('does not let anyone sign up as a driver', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...shirin, role: 'DRIVER' });

    expect(res.status).toBe(400);
  });
});

describe('sign-in (POST /auth/login) and GET /auth/me', () => {
  beforeEach(() => resetDatabase());

  it('signs Nusrat in and remembers her on the next request', async () => {
    const nusrat = await signedInAs(app, CAST.nusrat.email);

    const me = await nusrat.get('/api/v1/auth/me');

    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ fullName: 'Nusrat', role: 'PASSENGER', vehicle: null });
  });

  it('shows Jashim his Tesla: Bullet, 3 seats, parked at Banani', async () => {
    const jashim = await signedInAs(app, CAST.jashim.email);

    const me = await jashim.get('/api/v1/auth/me');

    expect(me.body.user).toMatchObject({
      fullName: 'Jashim',
      role: 'DRIVER',
      vehicle: { name: 'Bullet', capacity: 3, isOnline: false, currentZone: 'BANANI' },
    });
  });

  it('gives the same answer for a wrong password and an unknown email (401)', async () => {
    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: CAST.nusrat.email, password: 'not-her-password' });
    const unknownEmail = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@teslapool.test', password: DEMO_PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknownEmail.body.error.message).toBe(wrongPassword.body.error.message);
  });

  it('rate-limits sign-in attempts (the limit is advertised in response headers)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: CAST.nusrat.email, password: DEMO_PASSWORD });

    expect(res.headers['ratelimit-policy']).toBeDefined();
  });
});

// The test limit is 3 failed sign-ins per account (test/setup-env.ts); the real default is 10.
// Counters live in memory for the whole file, so later tests must not sign in as Shirin.
describe('sign-in rate limit (per account, failed attempts only)', () => {
  beforeEach(() => resetDatabase());

  const signIn = (email: string, password: string) =>
    request(app).post('/api/v1/auth/login').send({ email, password });

  it('pauses Shirin’s account after 3 wrong passwords, even for the right one, and only hers', async () => {
    for (const guess of ['banani0840', 'banani0842', 'gulshan0841']) {
      expect((await signIn(CAST.shirin.email, guess)).status).toBe(401);
    }

    const paused = await signIn('SHIRIN@teslapool.test', DEMO_PASSWORD); // same account, any letter case
    expect(paused.status).toBe(429);
    expect(paused.body.error.code).toBe('RATE_LIMITED');

    // Everyone reaches the API from the same (proxy) address, yet Rafiq is not affected.
    expect((await signIn(CAST.rafiq.email, DEMO_PASSWORD)).status).toBe(200);
  });

  it('never counts correct passwords: Nusrat can sign in again and again', async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await signIn(CAST.nusrat.email, DEMO_PASSWORD)).status).toBe(200);
    }
  });
});

describe('sessions', () => {
  let cast: Cast;

  beforeEach(async () => {
    await resetDatabase();
    cast = await loadCast();
  });

  it('asks for sign-in when there is no session cookie (401)', async () => {
    const res = await request(app).get('/api/v1/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a session token whose contents were edited', async () => {
    // Someone copies Nusrat's token and edits the payload to make her a DRIVER.
    const token = await signSessionToken({ id: cast.nusrat.id, role: 'PASSENGER' });
    const [header, payload, signature] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString());
    const forged = Buffer.from(JSON.stringify({ ...claims, role: 'DRIVER' })).toString('base64url');

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${header}.${forged}.${signature}`);

    expect(res.status).toBe(401); // the signature no longer matches the contents
  });

  it('signs out: the cookie is cleared and /me asks for sign-in again', async () => {
    const nusrat = await signedInAs(app, CAST.nusrat.email);

    const out = await nusrat.post('/api/v1/auth/logout');

    expect(out.status).toBe(204);
    expect((await nusrat.get('/api/v1/auth/me')).status).toBe(401);
  });
});

// ✍️ Your core piece #1: these tests define what requireRole must do (src/middleware/auth.ts).
describe('role guard (requireRole)', () => {
  let cast: Cast;

  beforeEach(async () => {
    await resetDatabase();
    cast = await loadCast();
  });

  // A small app with one driver-only and one passenger-only route, to test the guard on its own.
  const guarded = express();
  guarded.use(cookieParser());
  guarded.get('/driver-only', requireAuth, requireRole('DRIVER'), (_req, res) => {
    res.json({ ok: true });
  });
  guarded.get('/passenger-only', requireAuth, requireRole('PASSENGER'), (_req, res) => {
    res.json({ ok: true });
  });
  guarded.get('/no-auth-in-front', requireRole('DRIVER'), (_req, res) => {
    res.json({ ok: true });
  });
  guarded.use(errorHandler);

  const cookieFor = async (person: { id: string; role: 'PASSENGER' | 'DRIVER' }) =>
    `${SESSION_COOKIE}=${await signSessionToken({ id: person.id, role: person.role })}`;

  it('lets Jashim (a driver) into a driver-only route', async () => {
    const res = await request(guarded)
      .get('/driver-only')
      .set('Cookie', await cookieFor(cast.jashim));

    expect(res.status).toBe(200);
  });

  it('stops Nusrat (a passenger) at a driver-only route with 403 FORBIDDEN', async () => {
    const res = await request(guarded)
      .get('/driver-only')
      .set('Cookie', await cookieFor(cast.nusrat));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('stops Jashim at a passenger-only route with 403 FORBIDDEN', async () => {
    const res = await request(guarded)
      .get('/passenger-only')
      .set('Cookie', await cookieFor(cast.jashim));

    expect(res.status).toBe(403);
  });

  it('answers 401 if it is ever used without requireAuth in front', async () => {
    const res = await request(guarded).get('/no-auth-in-front');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});
