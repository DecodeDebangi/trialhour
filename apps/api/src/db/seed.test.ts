import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { formatInstant } from '@codeyoung/shared';
import { mentorSlotAt } from '../domain/slots.js';
import { planSeedBookings, scheduleOf, validateSeedMentors } from './seed.js';
import { SEED_BOOKINGS, SEED_MENTORS, type SeedBooking } from './seedData.js';

const now = DateTime.fromISO('2026-11-12T09:00:00Z', { zone: 'utc' }); // 2:30 PM India, Thu
const INDIA = 'Asia/Kolkata';
const byKey = (key: string) => SEED_MENTORS.find((m) => m.key === key)!;

describe('seed data', () => {
  it('has 10 mentors with unique ids, emails and real names, all in India time', () => {
    expect(SEED_MENTORS).toHaveLength(10);
    expect(new Set(SEED_MENTORS.map((m) => m.id)).size).toBe(10);
    expect(new Set(SEED_MENTORS.map((m) => m.email)).size).toBe(10);
    expect(SEED_MENTORS.every((m) => m.timezone === INDIA && !/^M\d+$/.test(m.name))).toBe(true);
  });

  it('every schedule is valid for a year (C11)', () => {
    expect(() => validateSeedMentors(SEED_MENTORS, now)).not.toThrow();
  });
});

describe('planSeedBookings', () => {
  const rows = planSeedBookings(SEED_MENTORS, SEED_BOOKINGS, now, 2);

  it('derives every shift date with mentorSlotAt, the function the app uses', () => {
    expect(rows).toHaveLength(SEED_BOOKINGS.length);
    for (const row of rows) {
      const mentor = SEED_MENTORS.find((m) => m.id === row.mentorId)!;
      expect(mentorSlotAt(scheduleOf(mentor), row.startUtc)?.shiftDate).toBe(row.shiftDate);
    }
  });

  it('puts tomorrow’s UK bookings in tomorrow’s shift, including the 00:30 one', () => {
    const ananya = rows.filter((r) => r.mentorId === byKey('M1').id);
    expect(ananya.map((r) => formatInstant(r.startUtc, INDIA))).toEqual([
      'Fri 13 Nov, 8:30 PM India time (GMT+5:30)',
      'Fri 13 Nov, 9:30 PM India time (GMT+5:30)',
    ]);
    const priya = rows.filter((r) => r.mentorId === byKey('M3').id);
    expect(formatInstant(priya[1]!.startUtc, INDIA)).toBe(
      'Sat 14 Nov, 12:30 AM India time (GMT+5:30)',
    );
    expect(priya.map((r) => r.shiftDate)).toEqual(['2026-11-13', '2026-11-13']);
  });

  it('never exceeds the cap per mentor and shift, and never double-books', () => {
    const perShift = new Map<string, number>();
    const starts = new Set<string>();
    for (const r of rows) {
      const key = `${r.mentorId}|${r.shiftDate}`;
      perShift.set(key, (perShift.get(key) ?? 0) + 1);
      starts.add(`${r.mentorId}|${r.startUtc.toISO()}`);
    }
    expect(Math.max(...perShift.values())).toBeLessThanOrEqual(2);
    expect(starts.size).toBe(rows.length);
  });

  it('fills normalised identity and a class link per booking', () => {
    const emma = rows[0]!;
    expect(emma.parentEmailNorm).toBe('emma.clarke@example.com');
    expect(emma.childNameNorm).toBe('oliver');
    expect(emma.classLink).toBe(`https://class.example.com/trial/${emma.id}`);
  });

  it('refuses a booking that would break the daily cap', () => {
    const third: SeedBooking = { ...SEED_BOOKINGS[0]!, slot: 2 }; // M1 already has 2 tomorrow
    expect(() => planSeedBookings(SEED_MENTORS, [...SEED_BOOKINGS, third], now, 2)).toThrow(
      /breaks our rules/,
    );
  });

  it('refuses double-booking a mentor at the same time', () => {
    expect(() =>
      planSeedBookings(SEED_MENTORS, [SEED_BOOKINGS[0]!, SEED_BOOKINGS[0]!], now, 2),
    ).toThrow(/breaks our rules/);
  });

  it('refuses a slot index the shift does not have, and past slots', () => {
    expect(() =>
      planSeedBookings(SEED_MENTORS, [{ ...SEED_BOOKINGS[0]!, slot: 9 }], now, 2),
    ).toThrow(/has no slot 9/);
    expect(() =>
      planSeedBookings(SEED_MENTORS, [{ ...SEED_BOOKINGS[0]!, shiftOffsetDays: -1 }], now, 2),
    ).toThrow(/starts in the past/);
  });
});
