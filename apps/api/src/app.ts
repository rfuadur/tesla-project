import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { driverRouter } from './modules/driver/driver.routes.js';
import { poolsRouter } from './modules/pools/pools.routes.js';
import { referenceRouter } from './modules/reference/reference.routes.js';
import { ridesRouter } from './modules/rides/rides.routes.js';
import { healthRouter } from './routes/health.js';

/**
 * Builds the Express app without starting a server, so tests can call it directly.
 * Middleware runs top to bottom for every request, so the order below matters.
 */
export function buildApp() {
  const app = express();
  app.disable('x-powered-by'); // don't advertise the framework
  // No `trust proxy`: nothing here needs the client's IP, and behind the Next.js proxy X-Forwarded-For
  // is whatever the client sent (see the sign-in rate limit in auth.routes.ts).

  app.use(requestLogger); // 1. request id + one log line per request
  app.use(helmet()); // 2. security headers: nosniff, HSTS, no framing, same-origin resource policy…
  app.use(express.json({ limit: '10kb' })); // 3. parse JSON bodies; small limit = basic abuse protection
  app.use(cookieParser()); // 4. read cookies (the session lives in one)

  app.use(healthRouter); // 5. GET /health

  const api = express.Router(); // 6. feature routers
  api.use('/auth', authRouter);
  api.use(referenceRouter); // /zones, /fares/estimate
  api.use('/rides', ridesRouter);
  api.use('/driver', driverRouter);
  api.use('/pools', poolsRouter);
  app.use('/api/v1', api);

  app.use(notFoundHandler); // 7. nothing matched → 404 in our error shape
  app.use(errorHandler); // 8. every error → one JSON shape (must be registered last)

  return app;
}
