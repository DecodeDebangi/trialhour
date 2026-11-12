import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import { DateTime } from 'luxon';
import { createApp } from '../../src/app.js';
import { FixedClock } from '../../src/clock.js';
import type { Pool } from '../../src/db/pool.js';
import { seed } from '../../src/db/seed.js';
import { SEED_MENTORS } from '../../src/db/seedData.js';
import {
  createAssignmentStrategy,
  type AssignmentStrategyName,
} from '../../src/domain/assignment/index.js';
import { mentorSlotAt } from '../../src/domain/slots.js';
import type { BookingPolicy } from '../../src/domain/types.js';
import { scheduleOf } from '../../src/db/seed.js';
import { createBookingRepository, insertBooking } from '../../src/repositories/bookingRepo.js';
import { createIdempotencyRepository } from '../../src/repositories/idempotencyRepo.js';
import { createMentorRepository } from '../../src/repositories/mentorRepo.js';
import {
  createTransactionRunner,
  type TransactionOptions,
} from '../../src/repositories/transaction.js';
import { BookingService } from '../../src/services/bookingService.js';
import { SlotService } from '../../src/services/slotService.js';

export const TEST_POLICY: BookingPolicy = { minNoticeMinutes: 240, horizonDays: 14, dailyCap: 2 };

export interface TestAppOptions {
  strategy?: AssignmentStrategyName;
  transactionOptions?: TransactionOptions;
  /** Skip reseeding (the test sets up its own data). */
  skipSeed?: boolean;
}

/** Builds the app on `pool` with a frozen clock; reseeds the database as of `now` by default. */
export async function seededApp(
  pool: Pool,
  now: string,
  options: TestAppOptions = {},
): Promise<{ app: Express; clock: FixedClock }> {
  const clock = new FixedClock(now);
  if (!options.skipSeed) await seed(pool, clock.now(), TEST_POLICY.dailyCap);
  const slotService = new SlotService({
    mentors: createMentorRepository(pool),
    bookings: createBookingRepository(pool),
    clock,
    policy: TEST_POLICY,
  });
  const bookingService = new BookingService({
    runInTransaction: createTransactionRunner(pool),
    mentors: createMentorRepository(pool),
    bookings: createBookingRepository(pool),
    idempotency: createIdempotencyRepository(pool),
    clock,
    policy: TEST_POLICY,
    strategy: createAssignmentStrategy(options.strategy ?? 'capacity-preserving'),
    ...(options.transactionOptions ? { transactionOptions: options.transactionOptions } : {}),
  });
  const app = createApp({
    slotService,
    bookingService,
    checkDatabase: async () => {
      await pool.query('SELECT 1');
    },
  });
  return { app, clock };
}

/** Starts a real HTTP server on a random port, for concurrent requests via fetch. */
export async function listen(app: Express): Promise<{ url: string; close: () => Promise<void> }> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export const mentorId = (key: string) => SEED_MENTORS.find((m) => m.key === key)!.id;
export const mentorName = (key: string) => SEED_MENTORS.find((m) => m.key === key)!.name;

/** Inserts a confirmed booking directly (test setup), deriving the shift date like the app does. */
export async function bookDirect(pool: Pool, key: string, startIso: string): Promise<void> {
  const mentor = SEED_MENTORS.find((m) => m.key === key)!;
  const slot = mentorSlotAt(scheduleOf(mentor), DateTime.fromISO(startIso, { zone: 'utc' }));
  if (!slot) throw new Error(`test setup: ${key} has no slot at ${startIso}`);
  await insertBooking(pool, {
    id: crypto.randomUUID(),
    mentorId: mentor.id,
    startUtc: slot.startUtc,
    endUtc: slot.endUtc,
    shiftDate: slot.shiftDate,
    parentName: 'Setup Parent',
    parentEmail: `setup-${crypto.randomUUID()}@example.com`,
    parentEmailNorm: 'setup@example.com',
    childName: 'Setup Child',
    childNameNorm: 'setup child',
    childGrade: 3,
    phone: null,
    parentTimezone: 'Europe/London',
    classLink: 'https://class.example.com/trial/setup',
  });
}

/** A valid booking request body for `startUtc`. */
export function bookingBody(startUtc: string, overrides: Record<string, unknown> = {}) {
  return {
    startUtc,
    parentTimezone: 'Europe/London',
    parentName: 'Emma Clarke',
    parentEmail: 'emma@example.com',
    childName: 'Oliver',
    childGrade: 4,
    ...overrides,
  };
}
