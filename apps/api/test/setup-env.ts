import { loadRootEnv, testDatabaseUrl } from './helpers/env.js';

// Runs in every test worker before the test files load the app's config.
loadRootEnv();

// Point the app at the test database (tesla_pool_test), never at your dev data.
process.env.DATABASE_URL = testDatabaseUrl();

// A small sign-in limit keeps the lockout test short (correct passwords never count, so other tests are
// unaffected). Every sign-up counts, so that limit is set out of the way.
process.env.SIGN_IN_RATE_LIMIT = '3';
process.env.SIGN_UP_RATE_LIMIT = '1000';

// Keep test output readable. Run with TEST_LOG_LEVEL=debug to see the API's logs while debugging.
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? 'silent';
