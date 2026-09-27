// `npm run db:seed` — load the Dhaka zones and the story cast (safe to run repeatedly).
import { db } from '../db/client.js';
import { pool } from '../db/pool.js';
import { seed } from '../db/seed.js';
import { logger } from '../lib/logger.js';

try {
  await seed(db);
  logger.info('seed complete: 10 zones, Jashim with Bullet (3 seats), Nusrat, Rafiq, Shirin');
} finally {
  await pool.end();
}
