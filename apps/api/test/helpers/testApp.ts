import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { FixedClock } from '../../src/clock.js';
import type { Pool } from '../../src/db/pool.js';
import { seed } from '../../src/db/seed.js';
import type { BookingPolicy } from '../../src/domain/types.js';
import { createBookingRepository } from '../../src/repositories/bookingRepo.js';
import { createMentorRepository } from '../../src/repositories/mentorRepo.js';
import { SlotService } from '../../src/services/slotService.js';

export const TEST_POLICY: BookingPolicy = { minNoticeMinutes: 240, horizonDays: 14, dailyCap: 2 };

/** Reseeds the test database as of `now` and builds the app with a frozen clock. */
export async function seededApp(
  pool: Pool,
  now: string,
): Promise<{ app: Express; clock: FixedClock }> {
  const clock = new FixedClock(now);
  await seed(pool, clock.now(), TEST_POLICY.dailyCap);
  const slotService = new SlotService({
    mentors: createMentorRepository(pool),
    bookings: createBookingRepository(pool),
    clock,
    policy: TEST_POLICY,
  });
  const app = createApp({
    slotService,
    checkDatabase: async () => {
      await pool.query('SELECT 1');
    },
  });
  return { app, clock };
}
