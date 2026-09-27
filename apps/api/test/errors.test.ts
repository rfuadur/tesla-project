import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { conflict } from '../src/lib/errors.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { requestLogger } from '../src/middleware/requestLogger.js';

describe('standard error responses', () => {
  const app = buildApp();

  it('answers an unknown route with 404 NOT_FOUND', async () => {
    const res = await request(app).get('/api/v1/teleport');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND', requestId: expect.any(String) });
  });

  it('rejects malformed JSON with 400 INVALID_JSON', async () => {
    const res = await request(app)
      .post('/api/v1/rides')
      .set('Content-Type', 'application/json')
      .send('{"pickupZone": "BANANI"'); // missing closing brace

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('errors thrown inside async handlers (Express 5 forwards them automatically)', () => {
  // A throwaway app with two handlers that fail, to test the error handler on its own.
  const app = express();
  app.use(requestLogger);
  app.get('/full', async () => {
    throw conflict('POOL_FULL', 'Bullet has no free seats left.');
  });
  app.get('/boom', async () => {
    throw new Error('database exploded: secret connection details');
  });
  app.use(errorHandler);

  it('turns an AppError into its status, code and message', async () => {
    const res = await request(app).get('/full');

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'POOL_FULL',
      message: 'Bullet has no free seats left.',
    });
  });

  it('hides unexpected errors behind a generic 500', async () => {
    const res = await request(app).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });
});
