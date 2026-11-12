import { DateTime } from 'luxon';
import type { Queryable } from '../db/pool.js';
import type { EmailMessage } from '../domain/emails.js';

export interface OutboxRecord {
  bookingId: string;
  startUtc: DateTime;
  childName: string;
  mentorName: string;
  parentTimezone: string;
  mentorTimezone: string;
  sentAt: DateTime;
  parent: { to: string; subject: string; body: string };
  mentor: { to: string; subject: string; body: string };
}

export interface OutboxRepository {
  /** Writes a booking's emails. Runs inside the booking transaction: both or neither. */
  insert(bookingId: string, messages: readonly EmailMessage[]): Promise<void>;
  /** Newest bookings first, each with its parent and mentor email. */
  list(options: { bookingId?: string; limit: number }): Promise<OutboxRecord[]>;
}

interface Row {
  booking_id: string;
  start_utc: Date;
  child_name: string;
  mentor_name: string;
  parent_timezone: string;
  mentor_timezone: string;
  sent_at: Date;
  recipient: 'parent' | 'mentor';
  to_email: string;
  subject: string;
  body_text: string;
}

const toUtc = (d: Date) => DateTime.fromJSDate(d, { zone: 'utc' });

export function createOutboxRepository(db: Queryable): OutboxRepository {
  return {
    async insert(bookingId, messages) {
      for (const m of messages) {
        await db.query(
          `INSERT INTO outbox_messages (booking_id, recipient, to_email, subject, body_text)
           VALUES ($1, $2, $3, $4, $5)`,
          [bookingId, m.recipient, m.to, m.subject, m.body],
        );
      }
    },

    async list({ bookingId, limit }) {
      const { rows } = await db.query<Row>(
        `WITH recent AS (
           SELECT booking_id, max(created_at) AS sent_at
             FROM outbox_messages
            WHERE $1::uuid IS NULL OR booking_id = $1::uuid
            GROUP BY booking_id
            ORDER BY max(created_at) DESC
            LIMIT $2
         )
         SELECT r.booking_id, r.sent_at, b.start_utc, b.child_name, b.parent_timezone,
                m.name AS mentor_name, m.timezone AS mentor_timezone,
                o.recipient, o.to_email, o.subject, o.body_text
           FROM recent r
           JOIN outbox_messages o ON o.booking_id = r.booking_id
           JOIN bookings b ON b.id = r.booking_id
           JOIN mentors m ON m.id = b.mentor_id
          ORDER BY r.sent_at DESC, b.start_utc, r.booking_id`,
        [bookingId ?? null, limit],
      );
      const byBooking = new Map<string, Partial<OutboxRecord> & { bookingId: string }>();
      for (const r of rows) {
        const entry = byBooking.get(r.booking_id) ?? {
          bookingId: r.booking_id,
          startUtc: toUtc(r.start_utc),
          childName: r.child_name,
          mentorName: r.mentor_name,
          parentTimezone: r.parent_timezone,
          mentorTimezone: r.mentor_timezone,
          sentAt: toUtc(r.sent_at),
        };
        entry[r.recipient] = { to: r.to_email, subject: r.subject, body: r.body_text };
        byBooking.set(r.booking_id, entry);
      }
      return [...byBooking.values()].filter(
        (e): e is OutboxRecord => e.parent !== undefined && e.mentor !== undefined,
      );
    },
  };
}
