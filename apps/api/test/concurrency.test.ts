import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { db } from '../src/db/client.js';
import { pool } from '../src/db/pool.js';
import { claimSeats } from '../src/modules/pools/pools.service.js';
import { resetDatabase } from './helpers/db.js';
import { accept, book, goOnline, signInCast } from './helpers/story.js';

// The brief's concurrency problem: "Bullet has 1 seat left. Nusrat and Shirin both try to claim it at
// nearly the same instant, and both initially see one seat available."

const app = buildApp();

afterAll(() => pool.end());

/** The invariant that must always hold: seats counted on the pool = seats of the riders in it ≤ capacity. */
async function seatsAddUp(poolId: string) {
  const { rows } = await db.execute(sql`
    SELECT p.capacity,
           p.seats_taken,
           COALESCE(SUM(r.seats) FILTER (WHERE r.status <> 'CANCELLED'), 0)::int AS seated
    FROM pools p
    LEFT JOIN ride_requests r ON r.pool_id = p.id
    WHERE p.id = ${poolId}
    GROUP BY p.id`);
  const { capacity, seats_taken, seated } = rows[0] as {
    capacity: number;
    seats_taken: number;
    seated: number;
  };
  expect(seated).toBe(seats_taken);
  expect(seats_taken).toBeLessThanOrEqual(capacity);
  return seats_taken;
}

describe("the last seat: Nusrat and Shirin book Bullet's final seat at the same instant", () => {
  it('lets exactly one of them in, every time (20 rounds)', { timeout: 120_000 }, async () => {
    for (let round = 1; round <= 20; round++) {
      await resetDatabase();
      const { jashim, nusrat, rafiq, shirin } = await signInCast(app);
      await goOnline(jashim);
      const rafiqRide = await book(rafiq, 'GULSHAN_1', { seats: 2 }); // Rafiq and a colleague
      const poolId = (await accept(jashim, rafiqRide.id)).body.pool.id as string; // Bullet: 2 of 3

      // Both see one free seat, and both press "Request" at the same moment.
      const [nusratRide, shirinRide] = await Promise.all([
        book(nusrat, 'MOHAKHALI'),
        book(shirin, 'MOHAKHALI'),
      ]);

      expect([nusratRide.status, shirinRide.status].sort()).toEqual(['MATCHED', 'REQUESTED']);
      expect(await seatsAddUp(poolId)).toBe(3);
    }
  });

  it('makes the second claim wait for the first, as Postgres itself reports', async () => {
    await resetDatabase();
    const { jashim, nusrat, rafiq, shirin } = await signInCast(app);
    await goOnline(jashim);
    // Nusrat and Shirin book before Bullet has a trip, so both are waiting (no auto-join yet).
    const nusratRide = await book(nusrat, 'MOHAKHALI');
    const shirinRide = await book(shirin, 'MOHAKHALI');
    const rafiqRide = await book(rafiq, 'GULSHAN_1', { seats: 2 });
    const poolId = (await accept(jashim, rafiqRide.id)).body.pool.id as string; // Bullet: 2 of 3

    // Nusrat's claim takes the pool lock and then pauses before committing...
    let nusratHoldsLock = false;
    let letNusratCommit!: () => void;
    const nusratMayCommit = new Promise<void>((resolve) => (letNusratCommit = resolve));
    const nusratClaim = db.transaction(async (tx) => {
      const verdict = await claimSeats(tx, {
        poolId,
        rideId: nusratRide.id,
        actorUserId: null,
        via: 'AUTO_JOIN',
      });
      nusratHoldsLock = true;
      await nusratMayCommit;
      return verdict;
    });
    await vi.waitFor(() => expect(nusratHoldsLock).toBe(true));

    // ...so Shirin's claim, starting now, has to wait at the lock.
    const shirinClaim = db.transaction((tx) =>
      claimSeats(tx, { poolId, rideId: shirinRide.id, actorUserId: null, via: 'AUTO_JOIN' }),
    );
    await vi.waitFor(async () => {
      const { rows } = await db.execute(sql`
        SELECT count(*)::int AS waiting FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`);
      expect(rows[0]).toEqual({ waiting: 1 });
    });

    // Nusrat commits; only then does Shirin's claim continue, and it now sees a full Tesla.
    letNusratCommit();
    expect(await nusratClaim).toEqual({ ok: true });
    expect(await shirinClaim).toEqual({ ok: false, reason: 'NOT_ENOUGH_SEATS' });
    expect(await seatsAddUp(poolId)).toBe(3);
  });
});
