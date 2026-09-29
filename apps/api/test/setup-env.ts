import { loadRootEnv, testDatabaseUrl } from './helpers/env.js';

// Runs in every test worker before the test files load the app's config.
loadRootEnv();

// Point the app at the test database (tesla_pool_test), never at your dev data.
process.env.DATABASE_URL = testDatabaseUrl();

// Tests sign in many times from the same address; a strict rate limit would get in the way.
process.env.AUTH_RATE_LIMIT_MAX = '1000';

// Keep test output readable. Run with TEST_LOG_LEVEL=debug to see the API's logs while debugging.
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? 'silent';
