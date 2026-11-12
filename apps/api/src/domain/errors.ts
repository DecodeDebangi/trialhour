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
