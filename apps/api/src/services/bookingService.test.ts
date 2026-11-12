import { describe, expect, it } from 'vitest';
import { FixedClock } from '../clock.js';
import { fairLoad } from '../domain/assignment/index.js';
import { SlotUnavailableError } from '../domain/errors.js';
import type { BookingRepository } from '../repositories/bookingRepo.js';
import { MentorSlotTakenError, TransientDatabaseError } from '../repositories/errors.js';
import type { MentorRepository } from '../repositories/mentorRepo.js';
import type { RunInTransaction } from '../repositories/transaction.js';
import { M1 } from '../../test/fixtures/schedules.js';
import { BookingService, DEFAULT_TRANSACTION_OPTIONS } from './bookingService.js';

const policy = { minNoticeMinutes: 240, horizonDays: 14, dailyCap: 2 };
const request = {
  startUtc: '2027-03-27T15:00:00Z',
  parentTimezone: 'Europe/London',
  parentName: 'Emma Clarke',
  parentEmail: 'emma@example.com',
  childName: 'Oliver',
  childGrade: 4,
};

/** In-memory repositories; `insert` behaviour is configurable. */
function service(insert: BookingRepository['insert'], seen: { options?: unknown } = {}) {
  const mentors: MentorRepository = {
    listWithSchedules: async () => [
      { id: 'M1', name: 'Ananya Iyer', email: 'a@x', timezone: 'Asia/Kolkata', schedule: M1 },
    ],
    lockForBooking: async () => {},
  };
  const bookings: BookingRepository = {
    listBookedSlots: async () => [],
    insert,
    findById: async () => null,
  };
  const runInTransaction: RunInTransaction = (options, fn) => {
    seen.options = options;
    return fn({ mentors, bookings });
  };
  return new BookingService({
    runInTransaction,
    bookings,
    clock: new FixedClock('2027-03-20T00:00:00Z'),
    policy,
    strategy: fairLoad,
  });
}

describe('BookingService backstop and timeouts', () => {
  it('maps a unique-index violation to a 409 SlotUnavailableError(FULLY_BOOKED), never a 500', async () => {
    const svc = service(async () => {
      throw new MentorSlotTakenError();
    });
    const error = await svc.createBooking(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SlotUnavailableError);
    expect(error).toMatchObject({ reason: 'FULLY_BOOKED', alternatives: [] });
  });

  it('lets transient database errors through (→ 503 in the middleware)', async () => {
    const svc = service(async () => {
      throw new TransientDatabaseError('55P03');
    });
    await expect(svc.createBooking(request)).rejects.toBeInstanceOf(TransientDatabaseError);
  });

  it('runs the transaction with the default lock and statement timeouts', async () => {
    const seen: { options?: unknown } = {};
    await service(async () => {}, seen).createBooking(request);
    expect(seen.options).toEqual(DEFAULT_TRANSACTION_OPTIONS);
    expect(DEFAULT_TRANSACTION_OPTIONS).toEqual({
      lockTimeoutMs: 3_000,
      statementTimeoutMs: 5_000,
    });
  });
});
