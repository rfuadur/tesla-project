import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { pool } from '../src/db/pool.js';
import { pools, rideRequests } from '../src/db/schema.js';
import { type Cast, expectDbError, loadCast, resetDatabase } from './helpers/db.js';

// These tests write rows straight into Postgres (no API, no app logic) to prove that the
// database itself refuses impossible states: the last line of defence if code ever has a bug.

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

let cast: Cast;

beforeEach(async () => {
  await resetDatabase();
  cast = await loadCast();
});

afterAll(() => pool.end());

const bulletPool = (overrides: Partial<typeof pools.$inferInsert> = {}) => ({
  vehicleId: cast.bullet.id,
  pickupZoneCode: 'BANANI',
  capacity: cast.bullet.capacity,
  ...overrides,
});

const nusratRide = (overrides: Partial<typeof rideRequests.$inferInsert> = {}) => ({
  passengerId: cast.nusrat.id,
  pickupZoneCode: 'BANANI',
  dropoffZoneCode: 'MOHAKHALI',
  seats: 1,
  distanceKm: 3,
  fareRuleVersion: 'v1',
  estimatedFarePaisa: 10_000,
  ...overrides,
});

describe("Bullet's seat capacity", () => {
  it('accepts a pool with all three seats taken', async () => {
    await db.insert(pools).values(bulletPool({ seatsTaken: 3 }));
  });

  it('refuses a pool with more seats taken than Bullet has', async () => {
    const error = await expectDbError(db.insert(pools).values(bulletPool({ seatsTaken: 4 })));

    expect(error.code).toBe(CHECK_VIOLATION);
    expect(error.constraint).toBe('pools_seats_within_capacity');
  });

  it('refuses to overbook a full pool, even with a raw UPDATE', async () => {
    const [full] = await db
      .insert(pools)
      .values(bulletPool({ seatsTaken: 3 }))
      .returning();

    const error = await expectDbError(
      db.execute(sql`UPDATE pools SET seats_taken = seats_taken + 1 WHERE id = ${full!.id}`),
    );

    expect(error.code).toBe(CHECK_VIOLATION);
  });
});

describe('one active trip per Tesla', () => {
  it('refuses a second active pool for Bullet', async () => {
    await db.insert(pools).values(bulletPool());

    const error = await expectDbError(db.insert(pools).values(bulletPool()));

    expect(error.code).toBe(UNIQUE_VIOLATION);
    expect(error.constraint).toBe('pools_one_active_per_vehicle');
  });

  it('allows a new pool once the previous trip is completed', async () => {
    const [done] = await db.insert(pools).values(bulletPool()).returning();
    await db.update(pools).set({ status: 'COMPLETED' }).where(eq(pools.id, done!.id));

    await db.insert(pools).values(bulletPool());
  });
});

describe('one active ride per passenger', () => {
  it('refuses a second active ride for Nusrat', async () => {
    await db.insert(rideRequests).values(nusratRide());

    const error = await expectDbError(db.insert(rideRequests).values(nusratRide()));

    expect(error.code).toBe(UNIQUE_VIOLATION);
    expect(error.constraint).toBe('ride_requests_one_active_per_passenger');
  });

  it('lets Nusrat book again after cancelling', async () => {
    const [first] = await db.insert(rideRequests).values(nusratRide()).returning();
    await db
      .update(rideRequests)
      .set({ status: 'CANCELLED' })
      .where(eq(rideRequests.id, first!.id));

    await db.insert(rideRequests).values(nusratRide());
  });
});

describe('ride rules', () => {
  it('refuses a ride that starts and ends in the same zone', async () => {
    const error = await expectDbError(
      db.insert(rideRequests).values(nusratRide({ dropoffZoneCode: 'BANANI' })),
    );

    expect(error.constraint).toBe('ride_requests_distinct_zones');
  });

  it('refuses a MATCHED ride that is not in any pool', async () => {
    const error = await expectDbError(
      db.insert(rideRequests).values(nusratRide({ status: 'MATCHED' })),
    );

    expect(error.constraint).toBe('ride_requests_status_matches_pool');
  });

  it('refuses a waiting (REQUESTED) ride that claims a pool', async () => {
    const [bullets] = await db.insert(pools).values(bulletPool()).returning();

    const error = await expectDbError(
      db.insert(rideRequests).values(nusratRide({ poolId: bullets!.id })),
    );

    expect(error.constraint).toBe('ride_requests_status_matches_pool');
  });
});

describe('fare columns', () => {
  it("computes Nusrat's final fare from its parts: ৳100 − ৳25 = ৳75", async () => {
    const [ride] = await db.insert(rideRequests).values(nusratRide()).returning();
    expect(ride!.finalFarePaisa).toBeNull(); // not decided until the trip starts

    const [started] = await db
      .update(rideRequests)
      .set({ poolDiscountPaisa: 2_500 })
      .where(eq(rideRequests.id, ride!.id))
      .returning();

    expect(started!.finalFarePaisa).toBe(7_500);
  });

  it('refuses a discount bigger than the fare', async () => {
    const error = await expectDbError(
      db.insert(rideRequests).values(nusratRide({ poolDiscountPaisa: 10_001 })),
    );

    expect(error.constraint).toBe('ride_requests_discount_within_estimate');
  });
});
