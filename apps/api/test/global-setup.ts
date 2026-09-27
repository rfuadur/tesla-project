import pg from 'pg';
import { runMigrations } from '../src/db/migrate.js';
import { loadRootEnv, testDatabaseUrl } from './helpers/env.js';

/** Runs once before all test files: makes sure the test database exists and is fully migrated. */
export default async function setup(): Promise<void> {
  loadRootEnv();
  const testUrl = testDatabaseUrl();
  const dbName = decodeURIComponent(new URL(testUrl).pathname.slice(1));

  // Connect to the server's built-in "postgres" database to create the test database the first time.
  const adminUrl = new URL(testUrl);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (existing.rowCount === 0)
      await admin.query(`CREATE DATABASE "${dbName.replaceAll('"', '""')}"`);
  } finally {
    await admin.end();
  }

  const pool = new pg.Pool({ connectionString: testUrl });
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}
