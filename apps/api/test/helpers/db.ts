import { eq, sql } from 'drizzle-orm';
import { db } from '../../src/db/client.js';
import { pgError } from '../../src/db/errors.js';
import { users, vehicles } from '../../src/db/schema.js';
import { CAST, seedCast, seedZones } from '../../src/db/seed.js';

/**
 * Empties every table and re-seeds the zones and (unless `withCast: false`) the story cast,
 * so each test starts from the same world.
 */
export async function resetDatabase({ withCast = true } = {}): Promise<void> {
  await db.execute(
    sql`TRUNCATE ride_events, payments, ride_requests, pools, vehicles, users, zones RESTART IDENTITY CASCADE`,
  );
  await seedZones(db);
  if (withCast) await seedCast(db);
}

/** The seeded cast, looked up by email. */
export async function loadCast() {
  const person = async (email: string) => {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) throw new Error(`${email} is missing: did resetDatabase() run?`);
    return user;
  };
  const jashim = await person(CAST.jashim.email);
  const [bullet] = await db.select().from(vehicles).where(eq(vehicles.driverId, jashim.id));
  if (!bullet) throw new Error('Bullet is missing: did resetDatabase() run?');

  return {
    jashim,
    bullet,
    nusrat: await person(CAST.nusrat.email),
    rafiq: await person(CAST.rafiq.email),
    shirin: await person(CAST.shirin.email),
  };
}

export type Cast = Awaited<ReturnType<typeof loadCast>>;

/** Awaits a query that must fail and returns Postgres's error (code + constraint name). */
export async function expectDbError(
  query: Promise<unknown>,
): Promise<{ code?: string; constraint?: string }> {
  try {
    await query;
  } catch (err) {
    return pgError(err);
  }
  throw new Error('expected the database to reject this, but it was accepted');
}
