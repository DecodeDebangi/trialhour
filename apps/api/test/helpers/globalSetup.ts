import { migrate } from '../../src/db/migrate.js';
import { createTestPool, TEST_DATABASE_URL } from './testDb.js';

/** Once per run: rebuild the test database schema from the migrations. */
export default async function setup(): Promise<void> {
  const pool = createTestPool();
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrate(pool);
  } catch (error) {
    throw new Error(
      `Integration tests need Postgres at ${TEST_DATABASE_URL} (run \`docker compose up -d db\`).\n${String(error)}`,
    );
  } finally {
    await pool.end();
  }
}
