import { eq, sql } from 'drizzle-orm';
import { ZONES } from '../domain/geo.js';
import { hashPassword } from '../lib/password.js';
import type { Db } from './client.js';
import { users, vehicles, zones } from './schema.js';

// Demo accounts are public on purpose (listed in the README): 08:41 at Banani is when the story starts.
export const DEMO_PASSWORD = 'banani0841';

export const CAST = {
  jashim: { email: 'jashim@teslapool.test', fullName: 'Jashim', role: 'DRIVER' },
  nusrat: { email: 'nusrat@teslapool.test', fullName: 'Nusrat', role: 'PASSENGER' },
  rafiq: { email: 'rafiq@teslapool.test', fullName: 'Rafiq', role: 'PASSENGER' },
  shirin: { email: 'shirin@teslapool.test', fullName: 'Shirin', role: 'PASSENGER' },
} as const;

/**
 * Seeds the Dhaka zones and the story cast. Idempotent: running it again changes nothing
 * (existing zones are updated in place, existing people and Bullet are left alone).
 */
export async function seed(db: Db): Promise<void> {
  await db
    .insert(zones)
    .values([...ZONES])
    .onConflictDoUpdate({
      target: zones.code,
      set: { name: sql`excluded.name`, lat: sql`excluded.lat`, lng: sql`excluded.lng` },
    });

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  await db
    .insert(users)
    .values(Object.values(CAST).map((person) => ({ ...person, passwordHash })))
    .onConflictDoNothing({ target: users.email });

  const [jashim] = await db.select().from(users).where(eq(users.email, CAST.jashim.email));
  if (!jashim) throw new Error('seed: Jashim was not created');

  // Bullet: three seats, parked at Banani, offline until Jashim goes online in the app.
  await db
    .insert(vehicles)
    .values({ driverId: jashim.id, name: 'Bullet', capacity: 3, currentZoneCode: 'BANANI' })
    .onConflictDoNothing({ target: vehicles.driverId });
}
