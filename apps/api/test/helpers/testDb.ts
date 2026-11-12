import { createPool, type Pool } from '../../src/db/pool.js';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://booking:booking@localhost:5433/booking_test';

export function createTestPool(): Pool {
  return createPool(TEST_DATABASE_URL);
}

/** Empties every app table (schema stays). Call in beforeEach for isolation. */
export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(
    'TRUNCATE outbox_messages, idempotency_keys, bookings, availability_windows, mentors',
  );
}
