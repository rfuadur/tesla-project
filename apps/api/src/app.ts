import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { healthRouter } from './routes/health.js';

/**
 * Builds the Express app without starting a server, so tests can call it directly.
 * Middleware runs top to bottom for every request, so the order below matters.
 */
export function buildApp() {
  const app = express();
  app.disable('x-powered-by'); // don't advertise the framework

  app.use(requestLogger); // 1. request id + one log line per request
  app.use(express.json({ limit: '10kb' })); // 2. parse JSON bodies; small limit = basic abuse protection

  app.use(healthRouter); // 3. GET /health

  const api = express.Router(); // 4. feature routers (auth, rides, driver, pools) mount here in later phases
  app.use('/api/v1', api);

  app.use(notFoundHandler); // 5. nothing matched → 404 in our error shape
  app.use(errorHandler); // 6. every error → one JSON shape (must be registered last)

  return app;
}
