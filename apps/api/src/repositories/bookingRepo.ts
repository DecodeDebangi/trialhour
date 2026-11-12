import { DateTime } from 'luxon';
import type { UtcRange } from '@codeyoung/shared';
import type { Queryable } from '../db/pool.js';
import type { BookedSlot } from '../domain/types.js';
import { MentorSlotTakenError, pgErrorCode } from './errors.js';

export interface NewBooking {
  id: string;
  mentorId: string;
  startUtc: DateTime;
  endUtc: DateTime;
  shiftDate: string;
  parentName: string;
  parentEmail: string;
  parentEmailNorm: string;
  childName: string;
  childNameNorm: string;
  childGrade: number;
  phone: string | null;
  parentTimezone: string;
  classLink: string;
}

/** A stored booking with its mentor, as shown on the confirmation page. */
export interface BookingDetails {
  id: string;
  startUtc: DateTime;
  endUtc: DateTime;
  parentName: string;
  parentEmail: string;
  childName: string;
  childGrade: number;
  parentTimezone: string;
  classLink: string;
  mentor: { id: string; name: string; timezone: string };
}

/** A confirmed trial for a parent + child that hasn't ended yet (upcoming or in progress). */
export interface UpcomingTrial {
  id: string;
  startUtc: DateTime;
  endUtc: DateTime;
  childName: string;
}

export interface BookingRepository {
  /** Confirmed bookings starting in [start, end). */
  listBookedSlots(range: UtcRange): Promise<BookedSlot[]>;
  /** Throws MentorSlotTakenError if the unique (mentor, start) backstop fires. */
  insert(booking: NewBooking): Promise<void>;
  findById(id: string): Promise<BookingDetails | null>;
  /**
   * Transaction-scoped advisory lock on one parent + child, so two concurrent requests for
   * the same child can't both pass the duplicate-trial check. Must run inside a transaction.
   */
  lockParentChild(emailNorm: string, childNorm: string): Promise<void>;
  findUpcomingTrial(
    emailNorm: string,
    childNorm: string,
    after: DateTime,
  ): Promise<UpcomingTrial | null>;
}

const toUtc = (d: Date) => DateTime.fromJSDate(d, { zone: 'utc' });

export function createBookingRepository(db: Queryable): BookingRepository {
  return {
    async listBookedSlots(range) {
      const { rows } = await db.query<{ mentor_id: string; start_utc: Date; shift_date: string }>(
        `SELECT mentor_id, start_utc, shift_date
           FROM bookings
          WHERE status = 'confirmed' AND start_utc >= $1 AND start_utc < $2
          ORDER BY start_utc, mentor_id`,
        [range.startUtc.toJSDate(), range.endUtc.toJSDate()],
      );
      return rows.map((r) => ({
        mentorId: r.mentor_id,
        startUtc: toUtc(r.start_utc),
        shiftDate: r.shift_date,
      }));
    },

    async insert(booking) {
      try {
        await insertBooking(db, booking);
      } catch (error) {
        if (pgErrorCode(error) === '23505') throw new MentorSlotTakenError();
        throw error;
      }
    },

    async lockParentChild(emailNorm, childNorm) {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `parent-child|${emailNorm}|${childNorm}`,
      ]);
    },

    async findUpcomingTrial(emailNorm, childNorm, after) {
      const { rows } = await db.query<{
        id: string;
        start_utc: Date;
        end_utc: Date;
        child_name: string;
      }>(
        `SELECT id, start_utc, end_utc, child_name
           FROM bookings
          WHERE parent_email_norm = $1 AND child_name_norm = $2
            AND status = 'confirmed' AND end_utc > $3
          ORDER BY start_utc
          LIMIT 1`,
        [emailNorm, childNorm, after.toJSDate()],
      );
      const r = rows[0];
      return r
        ? {
            id: r.id,
            startUtc: toUtc(r.start_utc),
            endUtc: toUtc(r.end_utc),
            childName: r.child_name,
          }
        : null;
    },

    async findById(id) {
      const { rows } = await db.query<{
        id: string;
        start_utc: Date;
        end_utc: Date;
        parent_name: string;
        parent_email: string;
        child_name: string;
        child_grade: number;
        parent_timezone: string;
        class_link: string;
        mentor_id: string;
        mentor_name: string;
        mentor_timezone: string;
      }>(
        `SELECT b.id, b.start_utc, b.end_utc, b.parent_name, b.parent_email, b.child_name,
                b.child_grade, b.parent_timezone, b.class_link,
                m.id AS mentor_id, m.name AS mentor_name, m.timezone AS mentor_timezone
           FROM bookings b JOIN mentors m ON m.id = b.mentor_id
          WHERE b.id = $1`,
        [id],
      );
      const r = rows[0];
      if (!r) return null;
      return {
        id: r.id,
        startUtc: toUtc(r.start_utc),
        endUtc: toUtc(r.end_utc),
        parentName: r.parent_name,
        parentEmail: r.parent_email,
        childName: r.child_name,
        childGrade: r.child_grade,
        parentTimezone: r.parent_timezone,
        classLink: r.class_link,
        mentor: { id: r.mentor_id, name: r.mentor_name, timezone: r.mentor_timezone },
      };
    },
  };
}

export async function insertBooking(db: Queryable, b: NewBooking): Promise<void> {
  await db.query(
    `INSERT INTO bookings (id, mentor_id, start_utc, end_utc, shift_date, parent_name, parent_email,
                           parent_email_norm, child_name, child_name_norm, child_grade, phone,
                           parent_timezone, class_link)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      b.id,
      b.mentorId,
      b.startUtc.toJSDate(),
      b.endUtc.toJSDate(),
      b.shiftDate,
      b.parentName,
      b.parentEmail,
      b.parentEmailNorm,
      b.childName,
      b.childNameNorm,
      b.childGrade,
      b.phone,
      b.parentTimezone,
      b.classLink,
    ],
  );
}
