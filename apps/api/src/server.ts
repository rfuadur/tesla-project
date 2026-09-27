import { buildApp } from './app.js';
import { env } from './config/env.js';
import { pool } from './db/pool.js';
import { logger } from './lib/logger.js';

const app = buildApp();

const server = app.listen(env.API_PORT, (err) => {
  if (err) {
    logger.fatal({ err }, 'could not start the API');
    process.exit(1);
  }
  logger.info(`Dhaka Tesla Pool API listening on http://localhost:${env.API_PORT}`);
});

// Graceful shutdown (Docker sends SIGTERM, Ctrl+C sends SIGINT): stop accepting new requests,
// let in-flight ones finish, then close the database pool. Force-exit if that takes over 10 s.
function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
