import { type RequestHandler, type Response, Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { SESSION_COOKIE, sessionCookieOptions, signSessionToken } from '../../lib/session.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { LoginBody, RegisterBody } from './auth.schemas.js';
import { getProfile, login, type PublicUser, registerPassenger } from './auth.service.js';

export const authRouter = Router();

const tooMany =
  (message: string): RequestHandler =>
  (_req, _res, next) =>
    next(new AppError(429, 'RATE_LIMITED', message));

// Slows down password guessing by counting FAILED sign-ins per account, not per IP address: behind the
// Next.js proxy every request arrives from the web server's address (all users would share one counter),
// and X-Forwarded-For can't be trusted, because the proxy passes on whatever the client sent.
// Trade-off: someone can pause sign-in for an account by failing on purpose (docs/decisions.md).
const signInRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.SIGN_IN_RATE_LIMIT,
  keyGenerator: (req) => `sign-in:${emailOf(req.body)}`,
  skipSuccessfulRequests: true, // a correct password never uses up the limit
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: tooMany(
    'Too many failed sign-ins for this account. Please wait 15 minutes and try again.',
  ),
});

// A new account can't be tied to anyone yet, so sign-ups are capped across the whole site:
// plenty for real people, a wall for a script creating accounts in bulk.
const signUpRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.SIGN_UP_RATE_LIMIT,
  keyGenerator: () => 'sign-up',
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: tooMany('Too many new accounts right now. Please try again later.'),
});

/** The email a sign-in is for, normalised like LoginBody, so "Nusrat@…" and "nusrat@…" share a counter. */
function emailOf(body: unknown): string {
  const email = typeof body === 'object' && body !== null && 'email' in body ? body.email : '';
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

async function startSession(res: Response, user: PublicUser): Promise<void> {
  res.cookie(SESSION_COOKIE, await signSessionToken(user), sessionCookieOptions);
}

// POST /api/v1/auth/register: passenger sign-up; signs the new passenger in straight away.
authRouter.post('/register', signUpRateLimit, async (req, res) => {
  const user = await registerPassenger(RegisterBody.parse(req.body));
  await startSession(res, user);
  res.status(201).json({ user });
});

// POST /api/v1/auth/login: passengers and drivers.
authRouter.post('/login', signInRateLimit, async (req, res) => {
  const user = await login(LoginBody.parse(req.body));
  await startSession(res, user);
  res.json({ user });
});

// POST /api/v1/auth/logout: the browser deletes the cookie.
authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions);
  res.status(204).end();
});

// GET /api/v1/auth/me: who am I? (drivers also see their Tesla)
authRouter.get('/me', requireAuth, async (req, res) => {
  res.json({ user: await getProfile(currentUser(req).id) });
});
