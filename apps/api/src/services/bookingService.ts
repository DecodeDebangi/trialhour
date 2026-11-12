import { randomUUID } from 'node:crypto';
import type { DateTime } from 'luxon';
import {
  bookingResponseSchema,
  parseInstant,
  type BookingRequest,
  type BookingResponse,
} from '@codeyoung/shared';
import type { Clock } from '../clock.js';
import { MAX_ALTERNATIVES, nearestAlternatives } from '../domain/alternatives.js';
import { toMentorStates, type AssignmentStrategy } from '../domain/assignment/index.js';
import { assessSlot, computeAvailability, indexBookings } from '../domain/availability.js';
import { classLinkFor } from '../domain/classLink.js';
import {
  BookingNotFoundError,
  DuplicateTrialError,
  IdempotencyKeyReusedError,
  RequestValidationError,
  SlotUnavailableError,
} from '../domain/errors.js';
import { requestFingerprint } from '../domain/idempotency.js';
import { normalizeIdentityPart } from '../domain/parentIdentity.js';
import { generateMentorSlots } from '../domain/slots.js';
import type { BookingPolicy } from '../domain/types.js';
import type { BookingDetails, BookingRepository } from '../repositories/bookingRepo.js';
import { MentorSlotTakenError } from '../repositories/errors.js';
import type { IdempotencyRepository } from '../repositories/idempotencyRepo.js';
import type { MentorRepository } from '../repositories/mentorRepo.js';
import type { RunInTransaction, TransactionOptions } from '../repositories/transaction.js';

export const DEFAULT_TRANSACTION_OPTIONS: TransactionOptions = {
  lockTimeoutMs: 3_000,
  statementTimeoutMs: 5_000,
};

export interface BookingServiceDeps {
  runInTransaction: RunInTransaction;
  /** For reads outside the booking transaction (alternatives, replays, GET). */
  mentors: MentorRepository;
  bookings: BookingRepository;
  idempotency: IdempotencyRepository;
  clock: Clock;
  policy: BookingPolicy;
  strategy: AssignmentStrategy;
  transactionOptions?: TransactionOptions;
}

export interface BookingResult {
  booking: BookingResponse;
  /** True when this is a repeat of an earlier request with the same Idempotency-Key. */
  replayed: boolean;
}

const NOT_OFFERED_MESSAGES = {
  OFF_GRID: 'Trial classes start on the hour (UTC). Pick one of the listed times.',
  NO_WINDOW: 'No mentor works at that time. Pick one of the listed times.',
  BEYOND_HORIZON: 'That time is too far ahead to book yet.',
} as const;

/** Thrown inside the transaction when the key is already taken; handled after rollback. */
class IdempotencyKeyTaken extends Error {}

const iso = (dt: DateTime) => dt.toUTC().toISO({ suppressMilliseconds: true }) as string;

export class BookingService {
  constructor(private readonly deps: BookingServiceDeps) {}

  /**
   * Books a trial class (SPEC §5). One transaction, in this order:
   *  1. claim the Idempotency-Key (a concurrent duplicate waits here, then replays)
   *  2. advisory-lock this parent + child, and refuse a second upcoming trial
   *  3. cheap slot checks (grid, window, horizon, notice)
   *  4. row-lock every mentor covering the slot, in id order
   *  5. re-read bookings, re-check eligibility, let the strategy choose, insert, store response
   * Locks are always taken in this order, so concurrent bookings can't deadlock.
   */
  async createBooking(request: BookingRequest, idempotencyKey: string): Promise<BookingResult> {
    const startUtc = parseInstant(request.startUtc);
    const requestHash = requestFingerprint(request);
    const now = this.deps.clock.now();

    try {
      const booking = await this.deps.runInTransaction(
        this.deps.transactionOptions ?? DEFAULT_TRANSACTION_OPTIONS,
        async (tx) => {
          if (!(await tx.idempotency.claim(idempotencyKey, requestHash))) {
            throw new IdempotencyKeyTaken();
          }

          const emailNorm = normalizeIdentityPart(request.parentEmail);
          const childNorm = normalizeIdentityPart(request.childName);
          await tx.bookings.lockParentChild(emailNorm, childNorm);
          const existing = await tx.bookings.findUpcomingTrial(emailNorm, childNorm, now);
          if (existing) {
            throw new DuplicateTrialError({
              id: existing.id,
              startUtc: iso(existing.startUtc),
              endUtc: iso(existing.endUtc),
              childName: existing.childName,
            });
          }

          const mentors = await tx.mentors.listWithSchedules();
          const schedules = mentors.map((m) => m.schedule);
          const precheck = assessSlot(startUtc, schedules, [], now, this.deps.policy);
          if (precheck.kind === 'not-offered') {
            const message = NOT_OFFERED_MESSAGES[precheck.reason];
            throw new RequestValidationError(message, [{ path: 'startUtc', message }]);
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
          const assessment = assessSlot(startUtc, schedules, booked, now, this.deps.policy);
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
              this.deps.policy,
            ),
          };
          const ranked = this.deps.strategy.rank(
            startUtc,
            toMentorStates(assessment.eligible, indexBookings(booked)),
            snapshot,
          );
          const chosen = assessment.eligible.find((s) => s.mentorId === ranked[0]!.mentorId)!;
          const mentor = mentors.find((m) => m.id === chosen.mentorId)!;

          const id = randomUUID();
          const details: BookingDetails = {
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
          };
          await tx.bookings.insert({
            ...details,
            mentorId: chosen.mentorId,
            shiftDate: chosen.shiftDate,
            parentEmailNorm: emailNorm,
            childNameNorm: childNorm,
            phone: request.phone ?? null,
          });
          const response = toResponse(details);
          await tx.idempotency.complete(idempotencyKey, id, 201, response);
          return response;
        },
      );
      return { booking, replayed: false };
    } catch (error) {
      if (error instanceof IdempotencyKeyTaken) return this.replay(idempotencyKey, requestHash);
      // Backstop: the row lock should make this impossible, but if the unique index ever
      // fires, the parent still gets a friendly 409, never a 500.
      if (error instanceof MentorSlotTakenError) {
        throw new SlotUnavailableError('FULLY_BOOKED', await this.alternatives(startUtc, request));
      }
      if (error instanceof SlotUnavailableError) {
        throw new SlotUnavailableError(error.reason, await this.alternatives(startUtc, request));
      }
      throw error;
    }
  }

  async getBooking(id: string): Promise<BookingResponse> {
    const booking = await this.deps.bookings.findById(id);
    if (!booking) throw new BookingNotFoundError(id);
    return toResponse(booking);
  }

  /** The key's transaction committed: same request → replay its response; different → 422. */
  private async replay(key: string, requestHash: string): Promise<BookingResult> {
    const stored = await this.deps.idempotency.find(key);
    if (!stored || stored.requestHash !== requestHash) throw new IdempotencyKeyReusedError();
    return { booking: bookingResponseSchema.parse(stored.responseBody), replayed: true };
  }

  /**
   * Up to 5 nearest open slots for the parent (SPEC §8), from a fresh read after the failed
   * transaction rolled back, so they already account for the booking that beat this one.
   */
  private async alternatives(startUtc: DateTime, request: BookingRequest) {
    const { clock, policy, mentors, bookings } = this.deps;
    const now = clock.now();
    const horizonEnd = now.plus({ days: policy.horizonDays, minutes: 1 });
    const schedules = (await mentors.listWithSchedules()).map((m) => m.schedule);
    const booked = await bookings.listBookedSlots({
      startUtc: now.minus({ hours: 24 }),
      endUtc: horizonEnd.plus({ hours: 24 }),
    });
    const nearest = (endUtc: DateTime) =>
      nearestAlternatives(
        computeAvailability(schedules, booked, { startUtc: now, endUtc }, now, policy),
        startUtc,
        request.parentTimezone,
      );
    // The requested local day plus the next usually holds 5 open slots; only scan the whole
    // horizon when it doesn't. This runs on every 409, so it should stay cheap.
    const dayStart = startUtc.setZone(request.parentTimezone).startOf('day');
    const soon = dayStart.plus({ days: 2 }).toUTC();
    let found = soon < horizonEnd ? nearest(soon) : [];
    if (found.length < MAX_ALTERNATIVES) found = nearest(horizonEnd);
    return found.map((s) => ({ startUtc: iso(s.startUtc), endUtc: iso(s.endUtc) }));
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
