import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { localDayBounds } from '@codeyoung/shared';
import {
  assessSlot,
  computeAvailability,
  eligibleMentorSlots,
  indexBookings,
} from './availability.js';
import { mentorSlotAt } from './slots.js';
import type { BookedSlot, BookingPolicy, MentorSchedule } from './types.js';
import { M1, M2, M3, SEED_SCHEDULES } from '../../test/fixtures/schedules.js';

const policy: BookingPolicy = { minNoticeMinutes: 240, horizonDays: 14, dailyCap: 2 };
const utc = (iso: string) => DateTime.fromISO(iso, { zone: 'utc' });
const WEEK_BEFORE = utc('2027-03-20T00:00:00Z');

/** Books `mentor` at `iso`, deriving the shift date the same way production will. */
function booked(mentor: MentorSchedule, iso: string): BookedSlot {
  const slot = mentorSlotAt(mentor, utc(iso));
  if (!slot) throw new Error(`fixture error: ${mentor.mentorId} has no slot at ${iso}`);
  return { mentorId: mentor.mentorId, startUtc: slot.startUtc, shiftDate: slot.shiftDate };
}

const mentorIds = (slots: { mentorId: string }[]) => slots.map((s) => s.mentorId);

// UK-evening shift of Sat 27 Mar 2027 (India): 15:00Z … 19:00Z. M1–M3 cover it.
const UK_SAT = ['2027-03-27T15:00:00Z', '2027-03-27T16:00:00Z', '2027-03-27T17:00:00Z'];

describe('indexBookings', () => {
  it('answers busy and per-shift counts', () => {
    const index = indexBookings([booked(M1, UK_SAT[0]!), booked(M1, '2027-03-27T19:00:00Z')]);
    expect(index.isBusy('M1', utc(UK_SAT[0]!))).toBe(true);
    expect(index.isBusy('M1', utc(UK_SAT[1]!))).toBe(false);
    expect(index.countInShift('M1', '2027-03-27')).toBe(2);
    expect(index.countInShift('M1', '2027-03-28')).toBe(0);
    expect(index.countInShift('M2', '2027-03-27')).toBe(0);
  });
});

describe('eligibleMentorSlots', () => {
  it('drops mentors busy at the slot and mentors at the cap', () => {
    const candidates = [M1, M2, M3].map((m) => mentorSlotAt(m, utc(UK_SAT[2]!))!);
    const index = indexBookings([
      booked(M1, UK_SAT[0]!),
      booked(M1, UK_SAT[1]!), // M1 at cap
      booked(M2, UK_SAT[2]!), // M2 busy at this slot
    ]);
    expect(mentorIds(eligibleMentorSlots(candidates, index, 2))).toEqual(['M3']);
  });
});

describe('assessSlot', () => {
  it('bookable: returns the eligible mentors, sorted by id', () => {
    const result = assessSlot(utc(UK_SAT[2]!), SEED_SCHEDULES, [], WEEK_BEFORE, policy);
    expect(result.kind).toBe('bookable');
    expect(result.kind === 'bookable' && mentorIds(result.eligible)).toEqual(['M1', 'M2', 'M3']);
  });

  it('C1: two bookings either side of India midnight fill one shift; the next evening is a new shift', () => {
    // 23:30 and 00:30 India time, both in the shift that started Sat 27 Mar.
    const bookings = [booked(M1, '2027-03-27T18:00:00Z'), booked(M1, '2027-03-27T19:00:00Z')];
    expect(bookings.map((b) => b.shiftDate)).toEqual(['2027-03-27', '2027-03-27']);

    const sameShift = assessSlot(utc(UK_SAT[2]!), [M1, M2], bookings, WEEK_BEFORE, policy);
    expect(sameShift.kind === 'bookable' && mentorIds(sameShift.eligible)).toEqual(['M2']);

    // Sun 28 Mar, 20:30 India time: new shift date, M1 is eligible again.
    const nextShift = assessSlot(utc('2027-03-28T15:00:00Z'), [M1], bookings, WEEK_BEFORE, policy);
    expect(nextShift.kind === 'bookable' && mentorIds(nextShift.eligible)).toEqual(['M1']);
  });

  it('C2: a mentor with 2 bookings in the shift is never eligible in that shift', () => {
    const bookings = [booked(M1, UK_SAT[0]!), booked(M1, UK_SAT[1]!)];
    for (const iso of ['2027-03-27T17:00:00Z', '2027-03-27T18:00:00Z', '2027-03-27T19:00:00Z']) {
      const result = assessSlot(utc(iso), [M1, M2], bookings, WEEK_BEFORE, policy);
      expect(result.kind === 'bookable' && mentorIds(result.eligible)).toEqual(['M2']);
    }
  });

  it('C2: every covering mentor at the cap → DAILY_LIMIT_REACHED', () => {
    const bookings = [M1, M2, M3].flatMap((m) => [booked(m, UK_SAT[0]!), booked(m, UK_SAT[1]!)]);
    expect(assessSlot(utc(UK_SAT[2]!), SEED_SCHEDULES, bookings, WEEK_BEFORE, policy)).toEqual({
      kind: 'unavailable',
      reason: 'DAILY_LIMIT_REACHED',
    });
  });

  it('every covering mentor booked at that time → FULLY_BOOKED', () => {
    const bookings = [M1, M2, M3].map((m) => booked(m, UK_SAT[2]!));
    expect(assessSlot(utc(UK_SAT[2]!), SEED_SCHEDULES, bookings, WEEK_BEFORE, policy)).toEqual({
      kind: 'unavailable',
      reason: 'FULLY_BOOKED',
    });
  });

  it('mix of at-cap and busy mentors → FULLY_BOOKED (not everyone is at the cap)', () => {
    const bookings = [
      booked(M1, UK_SAT[0]!),
      booked(M1, UK_SAT[1]!),
      booked(M2, UK_SAT[2]!),
      booked(M3, UK_SAT[2]!),
    ];
    expect(assessSlot(utc(UK_SAT[2]!), SEED_SCHEDULES, bookings, WEEK_BEFORE, policy)).toEqual({
      kind: 'unavailable',
      reason: 'FULLY_BOOKED',
    });
  });

  it('C7: 3h59m ahead → TOO_SOON; exactly 4h → bookable', () => {
    const slot = utc(UK_SAT[0]!);
    expect(
      assessSlot(slot, SEED_SCHEDULES, [], slot.minus({ hours: 3, minutes: 59 }), policy),
    ).toEqual({ kind: 'unavailable', reason: 'TOO_SOON' });
    expect(assessSlot(slot, SEED_SCHEDULES, [], slot.minus({ hours: 4 }), policy).kind).toBe(
      'bookable',
    );
  });

  it('C7: exactly 14 days ahead → bookable; later → not offered (422)', () => {
    const slot = utc(UK_SAT[0]!);
    expect(assessSlot(slot, SEED_SCHEDULES, [], slot.minus({ days: 14 }), policy).kind).toBe(
      'bookable',
    );
    expect(
      assessSlot(slot, SEED_SCHEDULES, [], slot.minus({ days: 14, minutes: 1 }), policy),
    ).toEqual({ kind: 'not-offered', reason: 'BEYOND_HORIZON' });
  });

  it('a start already in the past is TOO_SOON (409 with alternatives, not 422)', () => {
    const slot = utc(UK_SAT[0]!);
    expect(assessSlot(slot, SEED_SCHEDULES, [], slot.plus({ minutes: 5 }), policy)).toEqual({
      kind: 'unavailable',
      reason: 'TOO_SOON',
    });
  });

  it('TOO_SOON takes precedence over a full slot', () => {
    const bookings = [M1, M2, M3].map((m) => booked(m, UK_SAT[0]!));
    const slot = utc(UK_SAT[0]!);
    expect(assessSlot(slot, SEED_SCHEDULES, bookings, slot.minus({ hours: 1 }), policy)).toEqual({
      kind: 'unavailable',
      reason: 'TOO_SOON',
    });
  });

  it('C8: off-grid start → not offered (OFF_GRID)', () => {
    expect(
      assessSlot(utc('2027-03-27T15:30:00Z'), SEED_SCHEDULES, [], WEEK_BEFORE, policy),
    ).toEqual({ kind: 'not-offered', reason: 'OFF_GRID' });
  });

  it('C8: on the grid but outside every window → not offered (NO_WINDOW)', () => {
    // 13:00Z = 6:30 PM India time: no seed shift covers it.
    expect(
      assessSlot(utc('2027-03-27T13:00:00Z'), SEED_SCHEDULES, [], WEEK_BEFORE, policy),
    ).toEqual({ kind: 'not-offered', reason: 'NO_WINDOW' });
  });
});

describe('computeAvailability', () => {
  const londonSat = localDayBounds('2027-03-27', 'Europe/London');

  it('lists each covered start once, sorted, with every covering mentor', () => {
    const slots = computeAvailability(SEED_SCHEDULES, [], londonSat, WEEK_BEFORE, policy);
    const starts = slots.map((s) => s.startUtc.toMillis());
    expect(starts).toEqual([...new Set(starts)].sort((a, b) => a - b));
    expect(slots.every((s) => s.reason === null)).toBe(true);

    const at = (iso: string) => slots.find((s) => s.startUtc.toISO() === utc(iso).toISO());
    expect(mentorIds(at('2027-03-27T15:00:00Z')!.candidates)).toEqual(['M1', 'M2', 'M3']);
    // 04:30 India time: New York (M4–M6) and Los Angeles (M7–M8) shifts overlap.
    expect(mentorIds(at('2027-03-27T23:00:00Z')!.candidates)).toEqual([
      'M4',
      'M5',
      'M6',
      'M7',
      'M8',
    ]);
    // Only times inside some mentor's window are shown at all.
    expect(at('2027-03-27T13:00:00Z')).toBeUndefined();
  });

  it('hides past starts and greys out starts inside the notice period', () => {
    const now = utc('2027-03-27T16:30:00Z'); // earliest bookable = 20:30Z
    const slots = computeAvailability([M1, M2, M3], [], londonSat, now, policy);
    expect(slots.map((s) => [s.startUtc.toFormat('HH:mm'), s.reason])).toEqual([
      ['17:00', 'TOO_SOON'],
      ['18:00', 'TOO_SOON'],
      ['19:00', 'TOO_SOON'],
    ]);
    expect(slots.every((s) => s.eligible.length === 0)).toBe(true);
  });

  it('leaves out starts beyond the horizon', () => {
    const now = utc('2027-03-20T12:00:00Z');
    const range = { startUtc: now, endUtc: now.plus({ days: 20 }) };
    const slots = computeAvailability(SEED_SCHEDULES, [], range, now, policy);
    const latest = now.plus({ days: 14 });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.startUtc <= latest)).toBe(true);
  });

  it('assigns each greyed-out slot its reason', () => {
    const bookings = [
      ...[M1, M2, M3].flatMap((m) => [booked(m, UK_SAT[0]!), booked(m, UK_SAT[1]!)]),
    ];
    const slots = computeAvailability([M1, M2, M3], bookings, londonSat, WEEK_BEFORE, policy);
    expect(slots.map((s) => [s.startUtc.toFormat('HH:mm'), s.reason])).toEqual([
      ['15:00', 'DAILY_LIMIT_REACHED'],
      ['16:00', 'DAILY_LIMIT_REACHED'],
      ['17:00', 'DAILY_LIMIT_REACHED'],
      ['18:00', 'DAILY_LIMIT_REACHED'],
      ['19:00', 'DAILY_LIMIT_REACHED'],
    ]);
  });
});
