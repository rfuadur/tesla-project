import type { CookieOptions } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import { env } from '../config/env.js';
import { userRole } from '../db/schema.js';

export type UserRole = (typeof userRole.enumValues)[number];

/** Who is making a request, as proven by their session cookie. */
export interface AuthUser {
  id: string;
  role: UserRole;
}

export const SESSION_COOKIE = 'tp_session';
const SESSION_TTL_SECONDS = 24 * 60 * 60;
const secret = new TextEncoder().encode(env.JWT_SECRET);

// HttpOnly: page JavaScript can't read the cookie, so an XSS bug can't steal the session.
// SameSite=Lax: the browser doesn't send it on cross-site POSTs, which blocks CSRF.
// Secure: HTTPS only (turned on in production through COOKIE_SECURE).
export const sessionCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.COOKIE_SECURE,
  path: '/',
  maxAge: SESSION_TTL_SECONDS * 1000,
};

/**
 * A JWT is signed, not encrypted: anyone can read its claims (user id + role), but nobody can
 * change them without the secret. So it holds nothing private.
 */
export function signSessionToken(user: AuthUser): Promise<string> {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret);
}

const SessionClaims = z.object({ sub: z.uuid(), role: z.enum(userRole.enumValues) });

/** The user behind a token, or null if it is tampered with, expired or malformed. */
export async function verifySessionToken(token: string): Promise<AuthUser | null> {
  try {
    // Pinning the algorithm blocks "alg: none" and algorithm-confusion tricks.
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    const claims = SessionClaims.safeParse(payload);
    return claims.success ? { id: claims.data.sub, role: claims.data.role } : null;
  } catch {
    return null;
  }
}
