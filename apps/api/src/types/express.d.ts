import type { AuthUser } from '../lib/session.js';

// Teaches TypeScript that Express requests can carry the signed-in user.
declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth once the session cookie has been verified. */
      user?: AuthUser;
    }
  }
}

export {};
