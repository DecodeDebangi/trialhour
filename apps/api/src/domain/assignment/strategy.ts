import type { DateTime } from 'luxon';
import type { BookingIndex } from '../availability.js';
import type { MentorSlot } from '../types.js';

export const ASSIGNMENT_STRATEGY_NAMES = ['capacity-preserving', 'fair-load'] as const;
export type AssignmentStrategyName = (typeof ASSIGNMENT_STRATEGY_NAMES)[number];

/** An eligible mentor for the requested slot. */
export interface MentorState {
  mentorId: string;
  /** Shift the requested slot belongs to, for this mentor. */
  shiftDate: string;
  bookingsInShift: number;
}

/** Bookable slots around the request and who is eligible at each (SlotAvailability fits). */
export interface ShiftSnapshot {
  slots: ReadonlyArray<{
    startUtc: DateTime;
    eligible: ReadonlyArray<{ mentorId: string; shiftDate: string }>;
  }>;
}

/** Orders eligible mentors best-first. Pure and deterministic: same input, same order. */
export interface AssignmentStrategy {
  readonly name: AssignmentStrategyName;
  rank(
    slotStart: DateTime,
    eligible: readonly MentorState[],
    snapshot: ShiftSnapshot,
  ): MentorState[];
}

export function toMentorStates(
  eligible: readonly MentorSlot[],
  index: BookingIndex,
): MentorState[] {
  return eligible.map((s) => ({
    mentorId: s.mentorId,
    shiftDate: s.shiftDate,
    bookingsInShift: index.countInShift(s.mentorId, s.shiftDate),
  }));
}

/** Locale-independent id order, the final tie-break of every strategy. */
export function byMentorId(a: MentorState, b: MentorState): number {
  return a.mentorId < b.mentorId ? -1 : a.mentorId > b.mentorId ? 1 : 0;
}
