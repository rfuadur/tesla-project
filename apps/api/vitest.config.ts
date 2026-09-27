import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'], // once: create + migrate tesla_pool_test
    setupFiles: ['test/setup-env.ts'], // every worker: load .env, point at the test database
    environment: 'node',
    // Test files share one database and reset it, so they run one after another.
    fileParallelism: false,
  },
});
