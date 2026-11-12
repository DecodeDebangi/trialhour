import { SEED_MENTORS } from '../../src/db/seedData.js';
import type { MentorSchedule } from '../../src/domain/types.js';

/**
 * Seed schedules keyed by M-number (SPEC.md §4), so domain tests read like the spec.
 * Built from the real seed data: if the seed changes, the domain tests see it.
 */
function schedule(key: string): MentorSchedule {
  const m = SEED_MENTORS.find((s) => s.key === key);
  if (!m) throw new Error(`No seed mentor ${key}`);
  return {
    mentorId: key,
    timezone: m.timezone,
    windows: m.windows.map((w) => ({ ...w, id: `${key}-w${w.weekday}` })),
  };
}

export const M1 = schedule('M1');
export const M2 = schedule('M2');
export const M3 = schedule('M3');
export const M4 = schedule('M4');
export const M5 = schedule('M5');
export const M6 = schedule('M6');
export const M7 = schedule('M7');
export const M8 = schedule('M8');
export const M9 = schedule('M9');
export const M10 = schedule('M10');

export const SEED_SCHEDULES: readonly MentorSchedule[] = [M1, M2, M3, M4, M5, M6, M7, M8, M9, M10];
