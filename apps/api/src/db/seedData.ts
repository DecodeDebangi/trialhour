import type { AvailabilityWindow, Weekday } from '../domain/types.js';

/**
 * The 10 seed mentors (SPEC.md §4). All in India time; windows are India wall-clock times.
 * `key` is the M-number used in SPEC.md and the tests:
 *
 *   M1 Ananya Iyer      M2 Rohan Mehta     M3 Priya Nair      UK evenings      20:30 → 01:30
 *   M4 Arjun Sharma     M5 Kavya Reddy     M6 Vikram Joshi    US East evenings 01:30 → 06:30
 *   M7 Sneha Kulkarni   M8 Aditya Rao                         US West evenings 04:30 → 09:30
 *   M9 Meera Pillai                                           Australia        10:30 → 14:30
 *   M10 Karan Malhotra  Mon–Fri Australia 10:30 → 14:30; Sat–Sun UK mornings 13:30 → 17:30
 *
 * Ids are fixed so mentor-page URLs survive a reseed. A day off is just a missing weekday.
 */
export interface SeedWindow extends Omit<AvailabilityWindow, 'id'> {}

export interface SeedMentor {
  key: string;
  id: string;
  name: string;
  email: string;
  timezone: string;
  windows: readonly SeedWindow[];
}

const INDIA = 'Asia/Kolkata';
const EVERY_DAY: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

function on(days: Weekday[], startLocal: string, durationMin: number): SeedWindow[] {
  return days.map((weekday) => ({ weekday, startLocal, durationMin }));
}

const UK_EVENING = on(EVERY_DAY, '20:30', 300);
const US_EAST = on(EVERY_DAY, '01:30', 300);
const US_WEST = on(EVERY_DAY, '04:30', 300);
const AUSTRALIA = on(EVERY_DAY, '10:30', 240);

function mentor(n: number, name: string, windows: SeedWindow[]): SeedMentor {
  const first = name.split(' ')[0]!.toLowerCase();
  return {
    key: `M${n}`,
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    name,
    email: `${first}@mentors.example.com`,
    timezone: INDIA,
    windows,
  };
}

export const SEED_MENTORS: readonly SeedMentor[] = [
  mentor(1, 'Ananya Iyer', UK_EVENING),
  mentor(2, 'Rohan Mehta', UK_EVENING),
  mentor(3, 'Priya Nair', UK_EVENING),
  mentor(4, 'Arjun Sharma', US_EAST),
  mentor(5, 'Kavya Reddy', US_EAST),
  mentor(6, 'Vikram Joshi', US_EAST),
  mentor(7, 'Sneha Kulkarni', US_WEST),
  mentor(8, 'Aditya Rao', US_WEST),
  mentor(9, 'Meera Pillai', AUSTRALIA),
  mentor(10, 'Karan Malhotra', [...on([1, 2, 3, 4, 5], '10:30', 240), ...on([6, 7], '13:30', 240)]),
];

/**
 * Demo bookings, relative to "now", so the full state is visible on first run (SPEC §4).
 * `shiftOffsetDays` counts India dates from today; `slot` is the slot's index in the shift.
 * The seed derives start time and shift date with the domain functions and refuses any
 * booking that our own rules (busy, daily cap) would reject.
 */
export interface SeedBooking {
  mentor: string;
  shiftOffsetDays: number;
  slot: number;
  parent: { name: string; email: string; timezone: string };
  child: { name: string; grade: number };
}

const UK = (name: string, email: string) => ({ name, email, timezone: 'Europe/London' });
const NY = (name: string, email: string) => ({ name, email, timezone: 'America/New_York' });
const SYD = (name: string, email: string) => ({ name, email, timezone: 'Australia/Sydney' });

export const SEED_BOOKINGS: readonly SeedBooking[] = [
  // Tomorrow's UK-evening shift: M1–M3 each reach the cap → every UK slot shows DAILY_LIMIT_REACHED.
  {
    mentor: 'M1',
    shiftOffsetDays: 1,
    slot: 0,
    parent: UK('Emma Clarke', 'emma.clarke@example.com'),
    child: { name: 'Oliver', grade: 4 },
  },
  {
    mentor: 'M1',
    shiftOffsetDays: 1,
    slot: 1,
    parent: UK('James Patel', 'james.patel@example.com'),
    child: { name: 'Amelia', grade: 6 },
  },
  {
    mentor: 'M2',
    shiftOffsetDays: 1,
    slot: 2,
    parent: UK('Sophie Turner', 'sophie.t@example.com'),
    child: { name: 'Harry', grade: 3 },
  },
  {
    mentor: 'M2',
    shiftOffsetDays: 1,
    slot: 3,
    parent: UK('Daniel Hughes', 'dan.hughes@example.com'),
    child: { name: 'Isla', grade: 5 },
  },
  {
    mentor: 'M3',
    shiftOffsetDays: 1,
    slot: 0,
    parent: UK('Grace Wilson', 'grace.w@example.com'),
    child: { name: 'Noah', grade: 2 },
  },
  // Slot 4 is 00:30 India time: next India calendar day, same shift.
  {
    mentor: 'M3',
    shiftOffsetDays: 1,
    slot: 4,
    parent: UK('Liam Evans', 'liam.evans@example.com'),
    child: { name: 'Freya', grade: 7 },
  },
  // Tomorrow's first US-East slot: all three East mentors booked at once → FULLY_BOOKED.
  {
    mentor: 'M4',
    shiftOffsetDays: 1,
    slot: 0,
    parent: NY('Ashley Johnson', 'ashley.j@example.com'),
    child: { name: 'Mason', grade: 5 },
  },
  {
    mentor: 'M5',
    shiftOffsetDays: 1,
    slot: 0,
    parent: NY('Brian Lee', 'brian.lee@example.com'),
    child: { name: 'Ava', grade: 8 },
  },
  {
    mentor: 'M6',
    shiftOffsetDays: 1,
    slot: 0,
    parent: NY('Maria Garcia', 'maria.garcia@example.com'),
    child: { name: 'Lucas', grade: 3 },
  },
  // Tomorrow, Australia: M9 reaches the cap; M10 may still cover the shift on weekdays.
  {
    mentor: 'M9',
    shiftOffsetDays: 1,
    slot: 0,
    parent: SYD('Chloe Brown', 'chloe.brown@example.com'),
    child: { name: 'Jack', grade: 4 },
  },
  {
    mentor: 'M9',
    shiftOffsetDays: 1,
    slot: 1,
    parent: SYD('Ethan Wright', 'ethan.w@example.com'),
    child: { name: 'Mia', grade: 6 },
  },
];
