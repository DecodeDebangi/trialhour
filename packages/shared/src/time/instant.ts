import { DateTime } from 'luxon';

/**
 * Parses an instant into a UTC DateTime. Strings must carry `Z` or an explicit offset:
 * a bare local time like "2027-03-14T02:30" is ambiguous (or non-existent) on DST days.
 */
export function parseInstant(value: DateTime | string): DateTime {
  if (typeof value !== 'string') {
    if (!value.isValid)
      throw new Error(`Invalid instant: ${value.invalidExplanation ?? 'unknown'}`);
    return value.toUTC();
  }
  const dt = DateTime.fromISO(value, { setZone: true });
  if (!dt.isValid) throw new Error(`Invalid instant: ${value}`);
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    throw new Error(`Instant must include Z or an explicit offset: ${value}`);
  }
  return dt.toUTC();
}
