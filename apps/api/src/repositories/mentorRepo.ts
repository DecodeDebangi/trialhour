import type { Queryable } from '../db/pool.js';
import type { AvailabilityWindow, MentorSchedule, Weekday } from '../domain/types.js';

export interface Mentor {
  id: string;
  name: string;
  email: string;
  timezone: string;
}

export interface MentorWithSchedule extends Mentor {
  schedule: MentorSchedule;
}

export interface MentorRepository {
  listWithSchedules(): Promise<MentorWithSchedule[]>;
  /**
   * Row-locks the given mentors until the transaction ends. Always in id order, so two
   * bookings with overlapping candidate sets can never deadlock. Must run inside a transaction.
   */
  lockForBooking(mentorIds: readonly string[]): Promise<void>;
}

interface Row {
  id: string;
  name: string;
  email: string;
  timezone: string;
  window_id: string | null;
  weekday: number | null;
  start_local: string | null;
  duration_min: number | null;
}

export function createMentorRepository(db: Queryable): MentorRepository {
  return {
    async listWithSchedules() {
      const { rows } = await db.query<Row>(
        `SELECT m.id, m.name, m.email, m.timezone,
                w.id AS window_id, w.weekday, w.start_local::text AS start_local, w.duration_min
           FROM mentors m
           LEFT JOIN availability_windows w ON w.mentor_id = m.id
          ORDER BY m.id, w.weekday, w.start_local`,
      );
      const byId = new Map<string, MentorWithSchedule>();
      for (const row of rows) {
        let mentor = byId.get(row.id);
        if (!mentor) {
          const windows: AvailabilityWindow[] = [];
          mentor = {
            id: row.id,
            name: row.name,
            email: row.email,
            timezone: row.timezone,
            schedule: { mentorId: row.id, timezone: row.timezone, windows },
          };
          byId.set(row.id, mentor);
        }
        if (row.window_id) {
          (mentor.schedule.windows as AvailabilityWindow[]).push({
            id: row.window_id,
            weekday: row.weekday as Weekday,
            startLocal: row.start_local!.slice(0, 5), // "20:30:00" → "20:30"
            durationMin: row.duration_min!,
          });
        }
      }
      return [...byId.values()];
    },

    async lockForBooking(mentorIds) {
      await db.query('SELECT id FROM mentors WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [
        [...mentorIds],
      ]);
    },
  };
}

/** Inserts mentors and their windows. Used by the seed. */
export async function insertMentor(db: Queryable, mentor: Mentor, schedule: MentorSchedule) {
  await db.query('INSERT INTO mentors (id, name, email, timezone) VALUES ($1, $2, $3, $4)', [
    mentor.id,
    mentor.name,
    mentor.email,
    mentor.timezone,
  ]);
  for (const w of schedule.windows) {
    await db.query(
      `INSERT INTO availability_windows (mentor_id, weekday, start_local, duration_min)
       VALUES ($1, $2, $3, $4)`,
      [mentor.id, w.weekday, w.startLocal, w.durationMin],
    );
  }
}
