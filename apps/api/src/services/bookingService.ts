import { randomUUID } from 'node:crypto';
import type { DateTime } from 'luxon';
import { parseInstant, type BookingRequest, type BookingResponse } from '@codeyoung/shared';
import type { Clock } from '../clock.js';
import { toMentorStates, type AssignmentStrategy } from '../domain/assignment/index.js';
import { assessSlot, computeAvailability, indexBookings } from '../domain/availability.js';
import { classLinkFor } from '../domain/classLink.js';
import {
  BookingNotFoundError,
  RequestValidationError,
  SlotUnavailableError,
} from '../domain/errors.js';
import { normalizeIdentityPart } from '../domain/parentIdentity.js';
import { generateMentorSlots } from '../domain/slots.js';
import type { BookingPolicy } from '../domain/types.js';
import type { BookingDetails, BookingRepository } from '../repositories/bookingRepo.js';
import { MentorSlotTakenError } from '../repositories/errors.js';
import type { RunInTransaction, TransactionOptions } from '../repositories/transaction.js';

export const DEFAULT_TRANSACTION_OPTIONS: TransactionOptions = {
  lockTimeoutMs: 3_000,
  statementTimeoutMs: 5_000,
};

export interface BookingServiceDeps {
  runInTransaction: RunInTransaction;
  /** For reads outside the booking transaction. */
  bookings: BookingRepository;
  clock: Clock;
  policy: BookingPolicy;
  strategy: AssignmentStrategy;
  transactionOptions?: TransactionOptions;
}

const NOT_OFFERED_MESSAGES = {
  OFF_GRID: 'Trial classes start on the hour (UTC). Pick one of the listed times.',
  NO_WINDOW: 'No mentor works at that time. Pick one of the listed times.',
  BEYOND_HORIZON: 'That time is too far ahead to book yet.',
} as const;

const iso = (dt: DateTime) => dt.toUTC().toISO({ suppressMilliseconds: true }) as string;

export class BookingService {
  constructor(private readonly deps: BookingServiceDeps) {}

  /**
   * Books a trial class (SPEC §5). Inside one transaction: lock every mentor whose window
   * covers the slot (in id order), re-read their bookings, re-check eligibility, let the
   * strategy choose, insert. Because the strategy runs on locked data, "try the next mentor"
   * needs no retry loop: a mentor taken a moment ago is simply no longer eligible.
   */
  async createBooking(request: BookingRequest): Promise<BookingResponse> {
    const { runInTransaction, clock, policy, strategy } = this.deps;
    const options = this.deps.transactionOptions ?? DEFAULT_TRANSACTION_OPTIONS;
    const startUtc = parseInstant(request.startUtc);
    const now = clock.now();

    try {
      return await runInTransaction(options, async (tx) => {
        const mentors = await tx.mentors.listWithSchedules();
        const schedules = mentors.map((m) => m.schedule);

        // Cheap checks first, before taking any lock.
        const precheck = assessSlot(startUtc, schedules, [], now, policy);
        if (precheck.kind === 'not-offered') {
          throw new RequestValidationError(NOT_OFFERED_MESSAGES[precheck.reason], [
            { path: 'startUtc', message: NOT_OFFERED_MESSAGES[precheck.reason] },
          ]);
        }
        if (precheck.kind === 'unavailable') throw new SlotUnavailableError(precheck.reason);

        const covering = schedules.flatMap((s) =>
          generateMentorSlots(s, { startUtc, endUtc: startUtc.plus({ minutes: 1 }) }),
        );
        await tx.mentors.lockForBooking(covering.map((s) => s.mentorId));

        // Read only after the lock: we now see every booking committed before us.
        // ±48h covers every shift touching the ±24h snapshot below.
        const booked = await tx.bookings.listBookedSlots({
          startUtc: startUtc.minus({ hours: 48 }),
          endUtc: startUtc.plus({ hours: 48 }),
        });
        const assessment = assessSlot(startUtc, schedules, booked, now, policy);
        if (assessment.kind === 'not-offered') {
          throw new RequestValidationError(NOT_OFFERED_MESSAGES[assessment.reason]);
        }
        if (assessment.kind === 'unavailable') throw new SlotUnavailableError(assessment.reason);

        const snapshot = {
          slots: computeAvailability(
            schedules,
            booked,
            { startUtc: startUtc.minus({ hours: 24 }), endUtc: startUtc.plus({ hours: 24 }) },
            now,
            policy,
          ),
        };
        const ranked = strategy.rank(
          startUtc,
          toMentorStates(assessment.eligible, indexBookings(booked)),
          snapshot,
        );
        const chosen = assessment.eligible.find((s) => s.mentorId === ranked[0]!.mentorId)!;
        const mentor = mentors.find((m) => m.id === chosen.mentorId)!;

        const id = randomUUID();
        await tx.bookings.insert({
          id,
          mentorId: chosen.mentorId,
          startUtc: chosen.startUtc,
          endUtc: chosen.endUtc,
          shiftDate: chosen.shiftDate,
          parentName: request.parentName,
          parentEmail: request.parentEmail,
          parentEmailNorm: normalizeIdentityPart(request.parentEmail),
          childName: request.childName,
          childNameNorm: normalizeIdentityPart(request.childName),
          childGrade: request.childGrade,
          phone: request.phone ?? null,
          parentTimezone: request.parentTimezone,
          classLink: classLinkFor(id),
        });

        return toResponse({
          id,
          startUtc: chosen.startUtc,
          endUtc: chosen.endUtc,
          parentName: request.parentName,
          parentEmail: request.parentEmail,
          childName: request.childName,
          childGrade: request.childGrade,
          parentTimezone: request.parentTimezone,
          classLink: classLinkFor(id),
          mentor: { id: mentor.id, name: mentor.name, timezone: mentor.timezone },
        });
      });
    } catch (error) {
      // Backstop: the row lock should make this impossible, but if the unique index ever
      // fires, the parent still gets a friendly 409, never a 500.
      if (error instanceof MentorSlotTakenError) throw new SlotUnavailableError('FULLY_BOOKED');
      throw error;
    }
  }

  async getBooking(id: string): Promise<BookingResponse> {
    const booking = await this.deps.bookings.findById(id);
    if (!booking) throw new BookingNotFoundError(id);
    return toResponse(booking);
  }
}

function toResponse(b: BookingDetails): BookingResponse {
  return {
    id: b.id,
    startUtc: iso(b.startUtc),
    endUtc: iso(b.endUtc),
    parentTimezone: b.parentTimezone,
    parent: { name: b.parentName, email: b.parentEmail },
    child: { name: b.childName, grade: b.childGrade },
    mentor: b.mentor,
    classLink: b.classLink,
  };
}
