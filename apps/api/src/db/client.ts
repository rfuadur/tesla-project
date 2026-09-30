import { drizzle } from 'drizzle-orm/node-postgres';
import { pool } from './pool.js';
import * as schema from './schema.js';

// The typed query builder the services use, running on the shared connection pool.
export const db = drizzle({ client: pool, schema });

export type Db = typeof db;

/** An open transaction: the same query API as `db`, but every query runs inside that one transaction. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Anything queries can run on: the pool itself, or an open transaction. */
export type DbOrTx = Db | Tx;
