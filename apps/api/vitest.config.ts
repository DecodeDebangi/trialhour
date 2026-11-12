import { defineConfig } from 'vitest/config';

// Two projects: pure unit tests (no database) and integration tests against real Postgres.
export default defineConfig({
  test: {
    projects: [
      {
        test: { name: 'unit', include: ['src/**/*.test.ts'] },
      },
      {
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          globalSetup: ['test/helpers/globalSetup.ts'],
          // Files share one database; run them one at a time.
          fileParallelism: false,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
