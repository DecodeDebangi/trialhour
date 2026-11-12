import { DateTime } from 'luxon';

/** The only source of "now" in the API. Everything else receives a Clock. */
export interface Clock {
  /** Current instant, always in UTC. */
  now(): DateTime;
}

export class SystemClock implements Clock {
  now(): DateTime {
    return DateTime.utc();
  }
}

/** Frozen clock for tests and for NOW_OVERRIDE demos. */
export class FixedClock implements Clock {
  private instant: DateTime;

  constructor(instant: DateTime | string) {
    this.instant = toUtcInstant(instant);
  }

  now(): DateTime {
    return this.instant;
  }

  set(instant: DateTime | string): void {
    this.instant = toUtcInstant(instant);
  }

  advance(by: { minutes?: number; hours?: number; days?: number }): void {
    this.instant = this.instant.plus(by);
  }
}

function toUtcInstant(instant: DateTime | string): DateTime {
  const dt = typeof instant === 'string' ? DateTime.fromISO(instant, { setZone: true }) : instant;
  if (!dt.isValid) {
    throw new Error(`Invalid instant: ${String(instant)}`);
  }
  // An instant must be unambiguous: a bare local time like "2027-03-14T02:30" is rejected.
  if (typeof instant === 'string' && !/(Z|[+-]\d{2}:?\d{2})$/.test(instant)) {
    throw new Error(`Instant must include Z or an explicit offset: ${instant}`);
  }
  return dt.toUTC();
}

export function createClock(nowOverride: string | undefined): Clock {
  return nowOverride ? new FixedClock(nowOverride) : new SystemClock();
}
