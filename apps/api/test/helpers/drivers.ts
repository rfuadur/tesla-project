import { db } from '../../src/db/client.js';
import { users, vehicles } from '../../src/db/schema.js';
import { DEMO_PASSWORD } from '../../src/db/seed.js';
import { hashPassword } from '../../src/lib/password.js';

/**
 * A second driver who exists only in tests: Kamal with his Tesla "Rocket", also at Banani.
 * Used to prove one driver can't touch another's trip, and that two drivers can't both win one ride.
 */
export const KAMAL = { email: 'kamal@teslapool.test', password: DEMO_PASSWORD };

export async function addKamalWithRocket(): Promise<void> {
  const [kamal] = await db
    .insert(users)
    .values({
      role: 'DRIVER',
      fullName: 'Kamal',
      email: KAMAL.email,
      passwordHash: await hashPassword(KAMAL.password),
    })
    .returning();
  await db
    .insert(vehicles)
    .values({ driverId: kamal!.id, name: 'Rocket', capacity: 3, currentZoneCode: 'BANANI' });
}
