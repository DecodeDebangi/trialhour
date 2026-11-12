import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { FixedClock } from '../clock.js';
import { fairLoad } from '../domain/assignment/index.js';
import {
  DuplicateTrialError,
  IdempotencyKeyReusedError,
  SlotUnavailableError,
} from '../domain/errors.js';
import { requestFingerprint } from '../domain/idempotency.js';
import type { BookingRepository, UpcomingTrial } from '../repositories/bookingRepo.js';
import { MentorSlotTakenError, TransientDatabaseError } from '../repositories/errors.js';
import type { IdempotencyRepository } from '../repositories/idempotencyRepo.js';
import type { MentorRepository } from '../repositories/mentorRepo.js';
import type { RunInTransaction } from '../repositories/transaction.js';
import { M1 } from '../../test/fixtures/schedules.js';
import { BookingService, DEFAULT_TRANSACTION_OPTIONS } from './bookingService.js';

const policy = { minNoticeMinutes: 240, horizonDays: 14, dailyCap: 2 };
const KEY = '7d0e8c3a-0000-4000-8000-000000000001';
const request = {
  startUtc: '2027-03-27T15:00:00Z',
  parentTimezone: 'Europe/London',
  parentName: 'Emma Clarke',
  parentEmail: 'emma@example.com',
  childName: 'Oliver',
  childGrade: 4,
};

interface FakeOptions {
  insert?: BookingRepository['insert'];
  claim?: boolean;
  stored?: { requestHash: string; responseBody: unknown };
  upcoming?: UpcomingTrial | null;
  seen?: { options?: unknown };
}

/** In-memory repositories around one UK-evening mentor (M1). */
function service(opts: FakeOptions = {}) {
  const mentors: MentorRepository = {
    listWithSchedules: async () => [
      { id: 'M1', name: 'Ananya Iyer', email: 'a@x', timezone: 'Asia/Kolkata', schedule: M1 },
    ],
    lockForBooking: async () => {},
  };
  const bookings: BookingRepository = {
    listBookedSlots: async () => [],
    insert: opts.insert ?? (async () => {}),
    findById: async () => null,
    lockParentChild: async () => {},
    findUpcomingTrial: async () => opts.upcoming ?? null,
  };
  const idempotency: IdempotencyRepository = {
    claim: async () => opts.claim ?? true,
    complete: async () => {},
    find: async () => (opts.stored ? { ...opts.stored, responseStatus: 201 } : null),
  };
  const runInTransaction: RunInTransaction = (options, fn) => {
    if (opts.seen) opts.seen.options = options;
    return fn({ mentors, bookings, idempotency });
  };
  return new BookingService({
    runInTransaction,
    mentors,
    bookings,
    idempotency,
    clock: new FixedClock('2027-03-20T00:00:00Z'),
    policy,
    strategy: fairLoad,
  });
}

describe('BookingService: backstop and timeouts', () => {
  it('maps a unique-index violation to a 409 with alternatives, never a 500', async () => {
    const svc = service({
      insert: async () => {
        throw new MentorSlotTakenError();
      },
    });
    const error = await svc.createBooking(request, KEY).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SlotUnavailableError);
    const { reason, alternatives } = error as SlotUnavailableError;
    expect(reason).toBe('FULLY_BOOKED');
    // Same London day, nearest first: 16:00Z is the closest open M1 slot to 15:00Z.
    expect(alternatives[0]).toEqual({
      startUtc: '2027-03-27T16:00:00Z',
      endUtc: '2027-03-27T17:00:00Z',
    });
    expect(alternatives.length).toBeLessThanOrEqual(5);
  });

  it('lets transient database errors through (→ 503 in the middleware)', async () => {
    const svc = service({
      insert: async () => {
        throw new TransientDatabaseError('55P03');
      },
    });
    await expect(svc.createBooking(request, KEY)).rejects.toBeInstanceOf(TransientDatabaseError);
  });

  it('runs the transaction with the default lock and statement timeouts', async () => {
    const seen: { options?: unknown } = {};
    await service({ seen }).createBooking(request, KEY);
    expect(seen.options).toEqual(DEFAULT_TRANSACTION_OPTIONS);
    expect(DEFAULT_TRANSACTION_OPTIONS).toEqual({
      lockTimeoutMs: 3_000,
      statementTimeoutMs: 5_000,
    });
  });
});

describe('BookingService: idempotency and duplicates', () => {
  it('a taken key with the same request replays the stored response', async () => {
    const body = {
      id: '6f1c2b1e-0000-4000-8000-000000000001',
      startUtc: request.startUtc,
      endUtc: '2027-03-27T16:00:00Z',
      parentTimezone: request.parentTimezone,
      parent: { name: request.parentName, email: request.parentEmail },
      child: { name: request.childName, grade: request.childGrade },
      mentor: {
        id: '00000000-0000-4000-8000-000000000001',
        name: 'Ananya Iyer',
        timezone: 'Asia/Kolkata',
      },
      classLink: 'https://class.example.com/trial/6f1c2b1e-0000-4000-8000-000000000001',
    };
    const svc = service({
      claim: false,
      stored: { requestHash: requestFingerprint(request), responseBody: body },
    });
    expect(await svc.createBooking(request, KEY)).toEqual({ booking: body, replayed: true });
  });

  it('a taken key with a different request → IdempotencyKeyReusedError', async () => {
    const svc = service({ claim: false, stored: { requestHash: 'other', responseBody: {} } });
    await expect(svc.createBooking(request, KEY)).rejects.toBeInstanceOf(IdempotencyKeyReusedError);
  });

  it('an upcoming trial for the same parent + child → DuplicateTrialError with that booking', async () => {
    const upcoming = {
      id: '6f1c2b1e-0000-4000-8000-000000000009',
      startUtc: DateTime.fromISO('2027-03-28T15:00:00Z', { zone: 'utc' }),
      endUtc: DateTime.fromISO('2027-03-28T16:00:00Z', { zone: 'utc' }),
      childName: 'Oliver',
    };
    const error = await service({ upcoming })
      .createBooking(request, KEY)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DuplicateTrialError);
    expect((error as DuplicateTrialError).existingBooking).toEqual({
      id: upcoming.id,
      startUtc: '2027-03-28T15:00:00Z',
      endUtc: '2027-03-28T16:00:00Z',
      childName: 'Oliver',
    });
  });
});
