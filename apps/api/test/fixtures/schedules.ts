import type { AvailabilityWindow, MentorSchedule, Weekday } from '../../src/domain/types.js';

// Mirrors the seed shifts in SPEC.md §4. All mentors in India time.
const INDIA = 'Asia/Kolkata';
const ALL_DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

function windows(
  mentorId: string,
  days: Weekday[],
  startLocal: string,
  durationMin: number,
  tag = 'w',
): AvailabilityWindow[] {
  return days.map((weekday) => ({
    id: `${mentorId}-${tag}${weekday}`,
    weekday,
    startLocal,
    durationMin,
  }));
}

function mentor(mentorId: string, ws: AvailabilityWindow[]): MentorSchedule {
  return { mentorId, timezone: INDIA, windows: ws };
}

const ukEvening = (id: string) => mentor(id, windows(id, ALL_DAYS, '20:30', 300));
const usEast = (id: string) => mentor(id, windows(id, ALL_DAYS, '01:30', 300));
const usWest = (id: string) => mentor(id, windows(id, ALL_DAYS, '04:30', 300));

export const M1 = ukEvening('M1');
export const M2 = ukEvening('M2');
export const M3 = ukEvening('M3');
export const M4 = usEast('M4');
export const M5 = usEast('M5');
export const M6 = usEast('M6');
export const M7 = usWest('M7');
export const M8 = usWest('M8');
export const M9 = mentor('M9', windows('M9', ALL_DAYS, '10:30', 240));
export const M10 = mentor('M10', [
  ...windows('M10', [1, 2, 3, 4, 5], '10:30', 240, 'au'),
  ...windows('M10', [6, 7], '13:30', 240, 'ukwe'),
]);

export const SEED_SCHEDULES: readonly MentorSchedule[] = [M1, M2, M3, M4, M5, M6, M7, M8, M9, M10];
