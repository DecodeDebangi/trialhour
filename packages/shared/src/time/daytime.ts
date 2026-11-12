import type { DateTime } from 'luxon';
import { parseInstant } from './instant.js';

/**
 * "Daytime" for a young child's class, in the parent's own zone: the whole class fits between
 * 7:00 AM and 10:00 PM (so 9:00 PM is the last start; older students can take a 9 PM class).
 * The UI shows only these times by default (others behind a toggle) and
 * 409 alternatives prefer them. The one place these hours are defined.
 */
export const DAYTIME_START_HOUR = 7;
export const DAYTIME_END_HOUR = 22;
export const CLASS_MINUTES = 60;

export function isDaytime(
  startUtc: DateTime | string,
  zone: string,
  durationMinutes: number = CLASS_MINUTES,
): boolean {
  const local = parseInstant(startUtc).setZone(zone);
  if (!local.isValid) return false;
  const start = local.hour * 60 + local.minute;
  return start >= DAYTIME_START_HOUR * 60 && start + durationMinutes <= DAYTIME_END_HOUR * 60;
}
