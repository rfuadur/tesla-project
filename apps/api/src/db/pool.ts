import pg from 'pg';
import { env } from '../config/env.js';

// One shared connection pool for the whole process. Connections are opened lazily and reused.
// (Phase 3 puts Drizzle on top of this same pool.)
export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });
