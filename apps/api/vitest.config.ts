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
          // Files share one database, so they must run one at a time. A project-level
          // `fileParallelism: false` is ignored when projects are used; one fork enforces it.
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 20_000,
        },
      },
    ],
  },
});
