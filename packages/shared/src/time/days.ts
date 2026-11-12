import { DateTime } from 'luxon';
import { parseInstant } from './instant.js';
import { assertValidZone } from './zones.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface UtcRange {
  /** Inclusive. */
  startUtc: DateTime;
  /** Exclusive. */
  endUtc: DateTime;
}

/**
 * UTC bounds of a calendar day in a zone: [local midnight, next local midnight).
 * Uses calendar arithmetic, never +24h, so DST days come out as 23h or 25h.
 */
export function localDayBounds(date: string, zone: string): UtcRange {
  assertValidZone(zone);
  const start = ISO_DATE.test(date) ? DateTime.fromISO(date, { zone }) : null;
  if (!start?.isValid) throw new Error(`Invalid date (expected YYYY-MM-DD): ${date}`);
  return {
    startUtc: start.startOf('day').toUTC(),
    endUtc: start.plus({ days: 1 }).startOf('day').toUTC(),
  };
}

/** The calendar date ("YYYY-MM-DD") an instant falls on in a zone. */
export function localDateOf(instant: DateTime | string, zone: string): string {
  assertValidZone(zone);
  return parseInstant(instant).setZone(zone).toISODate() as string;
}
