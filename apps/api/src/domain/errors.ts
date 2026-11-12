import type { UnavailableReason } from './types.js';

/** Base for all business-rule errors. Routes map `code` to an HTTP status. */
export abstract class DomainError extends Error {
  abstract readonly code: string;
}

export class ScheduleValidationError extends DomainError {
  readonly code = 'INVALID_SCHEDULE';

  constructor(
    readonly mentorId: string,
    readonly issues: readonly string[],
  ) {
    super(`Invalid schedule for mentor ${mentorId}:\n  ${issues.join('\n  ')}`);
    this.name = 'ScheduleValidationError';
  }
}

/** A request that is well-formed but asks for something we don't allow (→ 422). */
export class RequestValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';

  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'RequestValidationError';
  }
}

const UNAVAILABLE_MESSAGES: Readonly<Record<UnavailableReason, string>> = {
  TOO_SOON: 'That time is too soon to book. Bookings close shortly before each class.',
  DAILY_LIMIT_REACHED: 'Our mentors have reached their class limit for that day.',
  FULLY_BOOKED: 'Sorry, that time has just been taken.',
};

/** The slot is real but can't be booked now (→ 409 with alternatives). */
export class SlotUnavailableError extends DomainError {
  readonly code = 'SLOT_UNAVAILABLE';

  constructor(
    readonly reason: UnavailableReason,
    readonly alternatives: ReadonlyArray<{ startUtc: string; endUtc: string }> = [],
  ) {
    super(UNAVAILABLE_MESSAGES[reason]);
    this.name = 'SlotUnavailableError';
  }
}

export class BookingNotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';

  constructor(readonly bookingId: string) {
    super('Booking not found');
    this.name = 'BookingNotFoundError';
  }
}
