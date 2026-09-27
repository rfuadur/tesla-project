import { drizzle } from 'drizzle-orm/node-postgres';
import { pool } from './pool.js';
import * as schema from './schema.js';

// The typed query builder the services use, running on the shared connection pool.
export const db = drizzle({ client: pool, schema });

export type Db = typeof db;
