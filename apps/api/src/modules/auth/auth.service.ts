import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { isUniqueViolation } from '../../db/errors.js';
import { users, vehicles } from '../../db/schema.js';
import { AppError, conflict, unauthenticated } from '../../lib/errors.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import type { LoginInput, RegisterInput } from './auth.schemas.js';

type UserRow = typeof users.$inferSelect;

/** What the API reveals about a user. The password hash never leaves the database. */
export function toPublicUser(user: UserRow) {
  return {
    id: user.id,
    role: user.role,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
  };
}

export type PublicUser = ReturnType<typeof toPublicUser>;

/** Sign-up is for passengers only: drivers are onboarded by operations (assumption A14). */
export async function registerPassenger(input: RegisterInput): Promise<PublicUser> {
  const passwordHash = await hashPassword(input.password);
  try {
    const [user] = await db
      .insert(users)
      .values({
        role: 'PASSENGER',
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        passwordHash,
      })
      .returning();
    if (!user) throw new Error('insert returned no row');
    return toPublicUser(user);
  } catch (err) {
    // The unique constraint decides, not an "is this email taken?" query beforehand, so two
    // sign-ups racing for the same email can't both succeed. (Same idea as the last seat.)
    if (isUniqueViolation(err, 'users_email_unique')) {
      throw conflict('EMAIL_TAKEN', 'An account with this email already exists.');
    }
    if (isUniqueViolation(err, 'users_phone_unique')) {
      throw conflict('PHONE_TAKEN', 'An account with this phone number already exists.');
    }
    throw err;
  }
}

let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword('not-a-real-password'));

export async function login(input: LoginInput): Promise<PublicUser> {
  const [user] = await db.select().from(users).where(eq(users.email, input.email));

  // Always check a password, even for an unknown email, so both failures take the same time
  // and return the same answer: the API never reveals which emails have accounts.
  const passwordOk = await verifyPassword(
    input.password,
    user?.passwordHash ?? (await getDummyHash()),
  );
  if (!user || !passwordOk) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }
  return toPublicUser(user);
}

/** The signed-in user's profile; drivers also get their Tesla. */
export async function getProfile(userId: string) {
  const [row] = await db
    .select({ user: users, vehicle: vehicles })
    .from(users)
    .leftJoin(vehicles, eq(vehicles.driverId, users.id))
    .where(eq(users.id, userId));
  if (!row) throw unauthenticated('Your account no longer exists.');

  const { vehicle } = row;
  return {
    ...toPublicUser(row.user),
    vehicle: vehicle && {
      id: vehicle.id,
      name: vehicle.name,
      capacity: vehicle.capacity,
      isOnline: vehicle.isOnline,
      currentZone: vehicle.currentZoneCode,
    },
  };
}
