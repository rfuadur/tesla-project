import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';

const app = buildApp();

afterAll(() => pool.end());

describe('GET /health', () => {
  it('reports the API and the database as healthy', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'ok' });
  });

  it('tags every response with a request id', async () => {
    const res = await request(app).get('/health');

    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
