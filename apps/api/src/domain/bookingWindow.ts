import type { DateTime } from 'luxon';
import type { BookingPolicy } from './types.js';

export type BookingWindowCheck = 'IN_PAST' | 'TOO_SOON' | 'OK' | 'BEYOND_HORIZON';

/** Bookable starts are in [now + notice, now + horizon], both inclusive (SPEC A6). */
export function bookableRange(now: DateTime, policy: BookingPolicy) {
  return {
    earliest: now.plus({ minutes: policy.minNoticeMinutes }),
    latest: now.plus({ days: policy.horizonDays }),
  };
}

export function checkBookingWindow(
  startUtc: DateTime,
  now: DateTime,
  policy: BookingPolicy,
): BookingWindowCheck {
  const { earliest, latest } = bookableRange(now, policy);
  if (startUtc <= now) return 'IN_PAST';
  if (startUtc < earliest) return 'TOO_SOON';
  if (startUtc > latest) return 'BEYOND_HORIZON';
  return 'OK';
}
