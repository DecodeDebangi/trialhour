import { DateTime } from 'luxon';
import { isValidZone, type UtcRange } from '@codeyoung/shared';
import { ScheduleValidationError } from './errors.js';
import type { AvailabilityWindow, MentorSchedule, MentorSlot } from './types.js';

export const SLOT_MINUTES = 60;
const SLOT_MS = SLOT_MINUTES * 60_000;
const MAX_WINDOW_MINUTES = 24 * 60;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * UTC instant a window starts on a given shift date. Mentor-local wall time is resolved in the
 * mentor's zone, so a mentor in a DST zone keeps the same local hours all year.
 * DST edge cases (Luxon): a start in the spring gap moves forward by the gap; a start in the
 * autumn overlap resolves to the later instant.
 */
export function windowStartUtc(
  window: AvailabilityWindow,
  shiftDate: string,
  zone: string,
): DateTime {
  return DateTime.fromISO(`${shiftDate}T${window.startLocal}`, { zone }).toUTC();
}

/** All slots of one window on one shift date. Slots step by elapsed time, not wall time. */
export function slotsForWindow(
  schedule: MentorSchedule,
  window: AvailabilityWindow,
  shiftDate: string,
): MentorSlot[] {
  const start = windowStartUtc(window, shiftDate, schedule.timezone);
  const count = Math.floor(window.durationMin / SLOT_MINUTES);
  return Array.from({ length: count }, (_, i) => {
    const startUtc = start.plus({ minutes: i * SLOT_MINUTES });
    return {
      mentorId: schedule.mentorId,
      windowId: window.id,
      startUtc,
      endUtc: startUtc.plus({ minutes: SLOT_MINUTES }),
      shiftDate,
    };
  });
}

/** A mentor's slots whose start lies in [fromUtc, toUtc), sorted by start. */
export function generateMentorSlots(schedule: MentorSchedule, range: UtcRange): MentorSlot[] {
  const zone = schedule.timezone;
  // A window lasts at most 24h, so a shift that started the day before can still reach `from`.
  let day = range.startUtc.setZone(zone).startOf('day').minus({ days: 1 });
  const lastDay = range.endUtc.setZone(zone).startOf('day');
  const slots: MentorSlot[] = [];

  while (day <= lastDay) {
    const shiftDate = day.toISODate() as string;
    for (const window of schedule.windows) {
      if (window.weekday !== day.weekday) continue;
      for (const slot of slotsForWindow(schedule, window, shiftDate)) {
        if (slot.startUtc >= range.startUtc && slot.startUtc < range.endUtc) slots.push(slot);
      }
    }
    day = day.plus({ days: 1 });
  }

  return slots.sort((a, b) => a.startUtc.toMillis() - b.startUtc.toMillis());
}

/** The mentor's slot starting exactly at `startUtc`, if any (gives its shift date). */
export function mentorSlotAt(schedule: MentorSchedule, startUtc: DateTime): MentorSlot | undefined {
  const target = startUtc.toMillis();
  return generateMentorSlots(schedule, {
    startUtc,
    endUtc: startUtc.plus({ minutes: 1 }),
  }).find((slot) => slot.startUtc.toMillis() === target);
}

/** True when a slot start is on the UTC hour grid (SPEC A4: :00 UTC = :30 India time). */
export function isOnSlotGrid(startUtc: DateTime): boolean {
  return startUtc.toMillis() % SLOT_MS === 0;
}

function windowIssues(window: AvailabilityWindow): string[] {
  const issues: string[] = [];
  const label = `window ${window.id}`;
  if (!Number.isInteger(window.weekday) || window.weekday < 1 || window.weekday > 7) {
    issues.push(`${label}: weekday must be 1–7, got ${window.weekday}`);
  }
  if (!HH_MM.test(window.startLocal)) {
    issues.push(`${label}: startLocal must be "HH:mm", got "${window.startLocal}"`);
  }
  const d = window.durationMin;
  if (!Number.isInteger(d) || d <= 0 || d % SLOT_MINUTES !== 0 || d > MAX_WINDOW_MINUTES) {
    issues.push(
      `${label}: duration must be a positive multiple of ${SLOT_MINUTES} min, ≤ 24h; got ${d}`,
    );
  }
  return issues;
}

/**
 * Checks a schedule against SPEC A4 over `days` shift dates from `fromDate` (mentor zone):
 * every slot on the UTC hour grid, and no two slots of the mentor overlapping. Checking real
 * dates (not just the window definition) catches zones where DST moves a window off-grid.
 */
export function validateSchedule(
  schedule: MentorSchedule,
  options: { fromDate: string; days: number },
): string[] {
  if (!isValidZone(schedule.timezone)) {
    return [`timezone "${schedule.timezone}" is not a supported IANA zone`];
  }
  const shapeIssues = schedule.windows.flatMap(windowIssues);
  if (shapeIssues.length > 0) return shapeIssues;

  const start = DateTime.fromISO(options.fromDate, { zone: schedule.timezone }).startOf('day');
  const slots = generateMentorSlots(schedule, {
    startUtc: start.toUTC(),
    endUtc: start.plus({ days: options.days }).toUTC(),
  });

  const issues = new Set<string>();
  const offGridReported = new Set<string>();
  for (const slot of slots) {
    if (!isOnSlotGrid(slot.startUtc) && !offGridReported.has(slot.windowId)) {
      offGridReported.add(slot.windowId);
      issues.add(
        `window ${slot.windowId}: slot on ${slot.shiftDate} starts at ` +
          `${slot.startUtc.toFormat('HH:mm')} UTC; slots must start on the UTC hour`,
      );
    }
  }
  // All slots are the same length, so in start order only neighbours can overlap.
  const overlapReported = new Set<string>();
  for (let i = 1; i < slots.length; i++) {
    const prev = slots[i - 1]!;
    const curr = slots[i]!;
    if (curr.startUtc < prev.endUtc && prev.windowId !== curr.windowId) {
      const pair = [prev.windowId, curr.windowId].sort().join(' and ');
      if (overlapReported.has(pair)) continue;
      overlapReported.add(pair);
      issues.add(`windows ${pair} overlap (first at ${curr.startUtc.toISO()})`);
    }
  }
  return [...issues];
}

export function assertValidSchedule(
  schedule: MentorSchedule,
  options: { fromDate: string; days: number },
): void {
  const issues = validateSchedule(schedule, options);
  if (issues.length > 0) throw new ScheduleValidationError(schedule.mentorId, issues);
}
