import type { DateTime } from 'luxon';
import type { UtcRange } from '@codeyoung/shared';
import { checkBookingWindow } from './bookingWindow.js';
import { generateMentorSlots, isOnSlotGrid, SLOT_MINUTES } from './slots.js';
import type {
  BookedSlot,
  BookingPolicy,
  MentorSchedule,
  MentorSlot,
  UnavailableReason,
} from './types.js';

/** Fast lookups over confirmed bookings: who is busy when, and how full each shift is. */
export interface BookingIndex {
  isBusy(mentorId: string, startUtc: DateTime): boolean;
  countInShift(mentorId: string, shiftDate: string): number;
}

export function indexBookings(bookings: readonly BookedSlot[]): BookingIndex {
  const busy = new Set<string>();
  const perShift = new Map<string, number>();
  for (const b of bookings) {
    busy.add(`${b.mentorId}|${b.startUtc.toMillis()}`);
    const key = `${b.mentorId}|${b.shiftDate}`;
    perShift.set(key, (perShift.get(key) ?? 0) + 1);
  }
  return {
    isBusy: (mentorId, startUtc) => busy.has(`${mentorId}|${startUtc.toMillis()}`),
    countInShift: (mentorId, shiftDate) => perShift.get(`${mentorId}|${shiftDate}`) ?? 0,
  };
}

/** Mentors free at their slot and under the cap for that slot's shift. */
export function eligibleMentorSlots(
  candidates: readonly MentorSlot[],
  index: BookingIndex,
  dailyCap: number,
): MentorSlot[] {
  return candidates.filter(
    (s) =>
      !index.isBusy(s.mentorId, s.startUtc) &&
      index.countInShift(s.mentorId, s.shiftDate) < dailyCap,
  );
}

export interface SlotAvailability {
  startUtc: DateTime;
  endUtc: DateTime;
  /** Every mentor whose window covers this start. */
  candidates: MentorSlot[];
  /** Candidates who can take it now. Empty when `reason` is set. */
  eligible: MentorSlot[];
  /** null = bookable. */
  reason: UnavailableReason | null;
}

function reasonFor(
  candidates: readonly MentorSlot[],
  eligible: readonly MentorSlot[],
  windowCheck: ReturnType<typeof checkBookingWindow>,
  index: BookingIndex,
  dailyCap: number,
): UnavailableReason | null {
  if (windowCheck === 'TOO_SOON') return 'TOO_SOON';
  if (eligible.length > 0) return null;
  const allAtCap = candidates.every((s) => index.countInShift(s.mentorId, s.shiftDate) >= dailyCap);
  return allAtCap ? 'DAILY_LIMIT_REACHED' : 'FULLY_BOOKED';
}

/**
 * Every slot start in `range` that at least one mentor's window covers, with its status.
 * Past starts and starts beyond the horizon are left out entirely (not shown, not greyed).
 */
export function computeAvailability(
  schedules: readonly MentorSchedule[],
  bookings: readonly BookedSlot[],
  range: UtcRange,
  now: DateTime,
  policy: BookingPolicy,
): SlotAvailability[] {
  const index = indexBookings(bookings);
  const byStart = new Map<number, MentorSlot[]>();
  for (const schedule of schedules) {
    for (const slot of generateMentorSlots(schedule, range)) {
      const key = slot.startUtc.toMillis();
      byStart.set(key, [...(byStart.get(key) ?? []), slot]);
    }
  }

  const result: SlotAvailability[] = [];
  for (const [, candidates] of [...byStart].sort(([a], [b]) => a - b)) {
    const startUtc = candidates[0]!.startUtc;
    const windowCheck = checkBookingWindow(startUtc, now, policy);
    if (windowCheck === 'IN_PAST' || windowCheck === 'BEYOND_HORIZON') continue;
    const sorted = [...candidates].sort((a, b) => (a.mentorId < b.mentorId ? -1 : 1));
    const eligible =
      windowCheck === 'OK' ? eligibleMentorSlots(sorted, index, policy.dailyCap) : [];
    result.push({
      startUtc,
      endUtc: startUtc.plus({ minutes: SLOT_MINUTES }),
      candidates: sorted,
      eligible,
      reason: reasonFor(sorted, eligible, windowCheck, index, policy.dailyCap),
    });
  }
  return result;
}

export type SlotAssessment =
  | { kind: 'bookable'; eligible: MentorSlot[] }
  /** 409 with alternatives: the slot is real but can't be had right now. */
  | { kind: 'unavailable'; reason: UnavailableReason }
  /** 422: the request names a slot we never offer. */
  | { kind: 'not-offered'; reason: 'OFF_GRID' | 'NO_WINDOW' | 'BEYOND_HORIZON' };

/**
 * Decides whether one requested start can be booked, given current bookings.
 * A start already in the past counts as TOO_SOON: the parent most likely left the form open,
 * and a 409 with alternatives helps them more than a validation error.
 */
export function assessSlot(
  startUtc: DateTime,
  schedules: readonly MentorSchedule[],
  bookings: readonly BookedSlot[],
  now: DateTime,
  policy: BookingPolicy,
): SlotAssessment {
  if (!isOnSlotGrid(startUtc)) return { kind: 'not-offered', reason: 'OFF_GRID' };

  const range = { startUtc, endUtc: startUtc.plus({ minutes: 1 }) };
  const candidates = schedules
    .flatMap((s) => generateMentorSlots(s, range))
    .sort((a, b) => (a.mentorId < b.mentorId ? -1 : 1));
  if (candidates.length === 0) return { kind: 'not-offered', reason: 'NO_WINDOW' };

  const windowCheck = checkBookingWindow(startUtc, now, policy);
  if (windowCheck === 'BEYOND_HORIZON') return { kind: 'not-offered', reason: 'BEYOND_HORIZON' };
  if (windowCheck === 'IN_PAST' || windowCheck === 'TOO_SOON') {
    return { kind: 'unavailable', reason: 'TOO_SOON' };
  }

  const index = indexBookings(bookings);
  const eligible = eligibleMentorSlots(candidates, index, policy.dailyCap);
  const reason = reasonFor(candidates, eligible, windowCheck, index, policy.dailyCap);
  return reason ? { kind: 'unavailable', reason } : { kind: 'bookable', eligible };
}
