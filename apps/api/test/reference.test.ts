import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';

const app = buildApp();

afterAll(() => pool.end());

describe('GET /api/v1/zones', () => {
  it('lists the 10 Dhaka zones without needing sign-in', async () => {
    const res = await request(app).get('/api/v1/zones');

    expect(res.status).toBe(200);
    expect(res.body.zones).toHaveLength(10);
    expect(res.body.zones).toContainEqual(
      expect.objectContaining({ code: 'BANANI', name: 'Banani' }),
    );
  });
});

describe('GET /api/v1/fares/estimate', () => {
  it('shows Nusrat both prices before she books: ৳100 solo, ৳75 pooled', async () => {
    const res = await request(app).get('/api/v1/fares/estimate?pickup=BANANI&dropoff=MOHAKHALI');

    expect(res.status).toBe(200);
    expect(res.body.estimate).toMatchObject({
      distanceKm: 3,
      seats: 1,
      solo: { totalPaisa: 10_000 },
      pooled: { totalPaisa: 7_500, poolDiscountPaisa: 2_500 },
    });
  });

  it('prices every seat of a group booking', async () => {
    const res = await request(app).get(
      '/api/v1/fares/estimate?pickup=BANANI&dropoff=GULSHAN_1&seats=2',
    );

    expect(res.body.estimate.solo.totalPaisa).toBe(24_000);
  });

  it.each([
    ['an unknown zone', 'pickup=BANANI&dropoff=NARNIA'],
    ['the same pickup and drop-off', 'pickup=BANANI&dropoff=BANANI'],
    ['more seats than a booking allows', 'pickup=BANANI&dropoff=MOHAKHALI&seats=4'],
    ['a missing drop-off', 'pickup=BANANI'],
  ])('rejects %s with 400 VALIDATION_ERROR', async (_label, query) => {
    const res = await request(app).get(`/api/v1/fares/estimate?${query}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
