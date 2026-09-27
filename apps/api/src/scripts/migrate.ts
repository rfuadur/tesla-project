// `npm run db:migrate` — bring the database schema up to date.
import { runMigrations } from '../db/migrate.js';
import { pool } from '../db/pool.js';
import { logger } from '../lib/logger.js';

try {
  await runMigrations(pool);
  logger.info('migrations applied');
} finally {
  await pool.end();
}
