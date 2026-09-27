import { existsSync } from 'node:fs';

// Tests read the same root .env as `npm run dev`; in CI the variables come from the environment instead.
const rootEnv = new URL('../../../.env', import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

// Keep test output readable. Run with TEST_LOG_LEVEL=debug to see the API's logs while debugging.
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? 'silent';
