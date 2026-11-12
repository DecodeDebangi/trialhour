import { DateTime } from 'luxon';
import { parseInstant } from '@codeyoung/shared';

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

/** Frozen clock for tests and for NOW_OVERRIDE demos. Rejects strings without an offset. */
export class FixedClock implements Clock {
  private instant: DateTime;

  constructor(instant: DateTime | string) {
    this.instant = parseInstant(instant);
  }

  now(): DateTime {
    return this.instant;
  }

  set(instant: DateTime | string): void {
    this.instant = parseInstant(instant);
  }

  advance(by: { minutes?: number; hours?: number; days?: number }): void {
    this.instant = this.instant.plus(by);
  }
}

export function createClock(nowOverride: string | undefined): Clock {
  return nowOverride ? new FixedClock(nowOverride) : new SystemClock();
}
