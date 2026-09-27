import { existsSync } from 'node:fs';

/** Loads the repo-root .env if it exists. In CI the variables come from the environment instead. */
export function loadRootEnv(): void {
  const rootEnv = new URL('../../../../.env', import.meta.url);
  if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
}

/**
 * Tests never touch your dev data: they use a sibling database with a `_test` suffix
 * (tesla_pool → tesla_pool_test), unless TEST_DATABASE_URL says otherwise.
 */
export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const devUrl = process.env.DATABASE_URL;
  if (!devUrl) throw new Error('DATABASE_URL is not set: copy .env.example to .env');
  const url = new URL(devUrl);
  if (!url.pathname.endsWith('_test')) url.pathname = `${url.pathname}_test`;
  return url.toString();
}
