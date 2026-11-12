/** The partial unique index fired: that mentor already has a confirmed booking at that start. */
export class MentorSlotTakenError extends Error {
  constructor() {
    super('Mentor already booked at this start (bookings_mentor_start_uniq)');
    this.name = 'MentorSlotTakenError';
  }
}

/** A lock or statement timeout fired. Safe for the client to retry shortly. */
export class TransientDatabaseError extends Error {
  constructor(readonly pgCode: string) {
    super(`Database busy (${pgCode})`);
    this.name = 'TransientDatabaseError';
  }
}

export function pgErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}
