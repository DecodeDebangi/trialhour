import { DateTime } from 'luxon';
import type { UtcRange } from '@codeyoung/shared';
import type { Queryable } from '../db/pool.js';
import type { BookedSlot } from '../domain/types.js';

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

export interface BookingRepository {
  /** Confirmed bookings starting in [start, end). */
  listBookedSlots(range: UtcRange): Promise<BookedSlot[]>;
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
