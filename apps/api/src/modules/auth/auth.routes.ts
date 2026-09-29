import { type Response, Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { SESSION_COOKIE, sessionCookieOptions, signSessionToken } from '../../lib/session.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { LoginBody, RegisterBody } from './auth.schemas.js';
import { getProfile, login, type PublicUser, registerPassenger } from './auth.service.js';

export const authRouter = Router();

// Slows down password guessing: a limited number of sign-in/sign-up attempts per IP per 15 minutes.
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) =>
    next(
      new AppError(
        429,
        'RATE_LIMITED',
        'Too many attempts. Please wait a few minutes and try again.',
      ),
    ),
});

async function startSession(res: Response, user: PublicUser): Promise<void> {
  res.cookie(SESSION_COOKIE, await signSessionToken(user), sessionCookieOptions);
}

// POST /api/v1/auth/register: passenger sign-up; signs the new passenger in straight away.
authRouter.post('/register', authRateLimit, async (req, res) => {
  const user = await registerPassenger(RegisterBody.parse(req.body));
  await startSession(res, user);
  res.status(201).json({ user });
});

// POST /api/v1/auth/login: passengers and drivers.
authRouter.post('/login', authRateLimit, async (req, res) => {
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
