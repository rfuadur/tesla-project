import type { Request, RequestHandler } from 'express';
import { forbidden, unauthenticated } from '../lib/errors.js';
import {
  type AuthUser,
  SESSION_COOKIE,
  type UserRole,
  verifySessionToken,
} from '../lib/session.js';

/** Lets a request through only with a valid session cookie, and records who it is in `req.user`. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string' || token === '') throw unauthenticated();

  const user = await verifySessionToken(token);
  if (!user) throw unauthenticated('Your session has expired. Please sign in again.');

  req.user = user;
  next();
};

/** The signed-in user. Use it after requireAuth; throws 401 if nobody is signed in. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthenticated();
  return req.user;
}

/**
 * Role guard: lets a request through only if the signed-in user has one of `roles`.
 * Put it after requireAuth, e.g.  router.post('/pools/:id/start', requireAuth, requireRole('DRIVER'), handler)
 */
export function requireRole(...roles: UserRole[]): RequestHandler {
  const allowed = roles.map((role) => `${role.toLowerCase()}s`).join(' and '); // e.g. "drivers"

  return (req, _res, next) => {
    // 1. Nobody signed in (requireAuth missing in front): 401, "who are you?"
    if (!req.user) throw unauthenticated();

    // 2. Signed in, but not allowed here: 403, "I know who you are, and you can't do this."
    if (!roles.includes(req.user.role)) throw forbidden(`Only ${allowed} can do this.`);

    // 3. Allowed: hand over to the next middleware or the route handler.
    next();
  };
}
