import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { formatTime } from '@codeyoung/shared';
import { assessSlot, computeAvailability, indexBookings } from '../availability.js';
import { mentorSlotAt } from '../slots.js';
import type { BookedSlot, BookingPolicy, MentorSchedule } from '../types.js';
import {
  capacityPreserving,
  createAssignmentStrategy,
  fairLoad,
  scarcityScore,
  toMentorStates,
  type MentorState,
  type ShiftSnapshot,
} from './index.js';
import { M4, M5, M6, SEED_SCHEDULES } from '../../../test/fixtures/schedules.js';

const policy: BookingPolicy = { minNoticeMinutes: 240, horizonDays: 14, dailyCap: 2 };
const utc = (iso: string) => DateTime.fromISO(iso, { zone: 'utc' });
const ids = (states: MentorState[]) => states.map((s) => s.mentorId);

function booked(mentor: MentorSchedule, iso: string): BookedSlot {
  const slot = mentorSlotAt(mentor, utc(iso))!;
  return { mentorId: mentor.mentorId, startUtc: slot.startUtc, shiftDate: slot.shiftDate };
}

/**
 * SPEC §6 example. India shift date Tue 23 Mar 2027:
 * M4–M6 (01:30–06:30) each have one booking at 01:30; M7–M8 (04:30–09:30) have none.
 * A parent books 04:30 India time (23:00Z). US clocks have already changed on 22 Mar, so that's
 * 7 PM New York / 4 PM Los Angeles (in winter the same slot is 6 PM / 3 PM, as SPEC §6 says).
 */
function specExample() {
  const now = utc('2027-03-15T00:00:00Z');
  const request = utc('2027-03-22T23:00:00Z');
  const bookings = [M4, M5, M6].map((m) => booked(m, '2027-03-22T20:00:00Z'));
  const assessment = assessSlot(request, SEED_SCHEDULES, bookings, now, policy);
  if (assessment.kind !== 'bookable') throw new Error('fixture error: slot should be bookable');
  const eligible = toMentorStates(assessment.eligible, indexBookings(bookings));
  // A window lasts ≤ 24h, so ±24h around the request covers every candidate's whole shift.
  const snapshot: ShiftSnapshot = {
    slots: computeAvailability(
      SEED_SCHEDULES,
      bookings,
      { startUtc: request.minus({ hours: 24 }), endUtc: request.plus({ hours: 24 }) },
      now,
      policy,
    ),
  };
  return { request, eligible, snapshot };
}

describe('toMentorStates', () => {
  it('carries the shift date and the bookings already in that shift', () => {
    const { eligible } = specExample();
    expect(eligible).toEqual([
      { mentorId: 'M4', shiftDate: '2027-03-23', bookingsInShift: 1 },
      { mentorId: 'M5', shiftDate: '2027-03-23', bookingsInShift: 1 },
      { mentorId: 'M6', shiftDate: '2027-03-23', bookingsInShift: 1 },
      { mentorId: 'M7', shiftDate: '2027-03-23', bookingsInShift: 0 },
      { mentorId: 'M8', shiftDate: '2027-03-23', bookingsInShift: 0 },
    ]);
  });
});

describe('scarcityScore', () => {
  it('C5: matches the SPEC §6 numbers (M4 ≈ 0.87, M7 = 1.70)', () => {
    const { request, eligible, snapshot } = specExample();
    expect(formatTime(request, 'Asia/Kolkata')).toBe('4:30 AM');
    expect(formatTime(request, 'America/New_York')).toBe('7:00 PM');
    expect(formatTime(request, 'America/Los_Angeles')).toBe('4:00 PM');
    const m4 = eligible.find((m) => m.mentorId === 'M4')!;
    const m7 = eligible.find((m) => m.mentorId === 'M7')!;
    // M4: 02:30 and 03:30 (M4–M6 → 1/3 each), 05:30 (M4–M8 → 1/5).
    expect(scarcityScore(m4, request, snapshot)).toBeCloseTo(1 / 3 + 1 / 3 + 1 / 5, 9);
    // M7: 05:30 (1/5), 06:30–08:30 (only M7, M8 → 1/2 each).
    expect(scarcityScore(m7, request, snapshot)).toBeCloseTo(1 / 5 + 3 / 2, 9);
  });

  it('ignores the requested slot, other shifts and slots nobody can take', () => {
    const start = utc('2027-03-22T23:00:00Z');
    const a: MentorState = { mentorId: 'A', shiftDate: '2027-03-23', bookingsInShift: 0 };
    const snapshot: ShiftSnapshot = {
      slots: [
        { startUtc: start, eligible: [{ mentorId: 'A', shiftDate: '2027-03-23' }] },
        { startUtc: start.plus({ hours: 1 }), eligible: [] },
        {
          startUtc: start.plus({ hours: 20 }),
          eligible: [{ mentorId: 'A', shiftDate: '2027-03-24' }],
        },
        {
          startUtc: start.plus({ hours: 2 }),
          eligible: [
            { mentorId: 'A', shiftDate: '2027-03-23' },
            { mentorId: 'B', shiftDate: '2027-03-23' },
          ],
        },
      ],
    };
    expect(scarcityScore(a, start, snapshot)).toBe(0.5);
  });
});

describe('strategies on the SPEC §6 example', () => {
  it('C5: capacity-preserving picks M4 and keeps the Los Angeles mentors free', () => {
    const { request, eligible, snapshot } = specExample();
    expect(ids(capacityPreserving.rank(request, eligible, snapshot))).toEqual([
      'M4',
      'M5',
      'M6',
      'M7',
      'M8',
    ]);
  });

  it('C5: fair-load picks M7 (fewest bookings)', () => {
    const { request, eligible, snapshot } = specExample();
    expect(ids(fairLoad.rank(request, eligible, snapshot))).toEqual(['M7', 'M8', 'M4', 'M5', 'M6']);
  });
});

describe('determinism (C6)', () => {
  const start = utc('2027-03-22T23:00:00Z');
  const state = (mentorId: string, bookingsInShift: number): MentorState => ({
    mentorId,
    shiftDate: '2027-03-23',
    bookingsInShift,
  });
  const empty: ShiftSnapshot = { slots: [] };

  function permutations<T>(items: T[]): T[][] {
    if (items.length <= 1) return [items];
    return items.flatMap((item, i) =>
      permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
    );
  }

  it('C6: every input order gives the same ranking, for both strategies', () => {
    const { request, eligible, snapshot } = specExample();
    for (const strategy of [capacityPreserving, fairLoad]) {
      const expected = ids(strategy.rank(request, eligible, snapshot));
      for (const order of permutations(eligible)) {
        expect(ids(strategy.rank(request, order, snapshot))).toEqual(expected);
      }
    }
  });

  it('C6: equal scarcity → fewest bookings, then mentor id', () => {
    const eligible = [state('C', 1), state('B', 0), state('A', 1), state('D', 0)];
    expect(ids(capacityPreserving.rank(start, eligible, empty))).toEqual(['B', 'D', 'A', 'C']);
    expect(ids(fairLoad.rank(start, eligible, empty))).toEqual(['B', 'D', 'A', 'C']);
  });

  it('C6: does not mutate its input', () => {
    const eligible = [state('B', 0), state('A', 0)];
    const copy = structuredClone(eligible);
    capacityPreserving.rank(start, eligible, empty);
    fairLoad.rank(start, eligible, empty);
    expect(eligible).toEqual(copy);
  });

  it('id tie-break is locale-independent (M10 sorts before M2, as plain strings)', () => {
    expect(ids(fairLoad.rank(start, [state('M2', 0), state('M10', 0)], empty))).toEqual([
      'M10',
      'M2',
    ]);
  });
});

describe('createAssignmentStrategy', () => {
  it('returns the strategy for each configured name', () => {
    expect(createAssignmentStrategy('capacity-preserving')).toBe(capacityPreserving);
    expect(createAssignmentStrategy('fair-load')).toBe(fairLoad);
  });
});
