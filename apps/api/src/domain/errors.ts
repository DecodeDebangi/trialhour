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
