import type { DateTime } from 'luxon';
import type { OutboxQuery, OutboxResponse } from '@codeyoung/shared';
import type { OutboxRepository } from '../repositories/outboxRepo.js';

const iso = (dt: DateTime) => dt.toUTC().toISO({ suppressMilliseconds: true }) as string;

/** Read side of the mock email outbox (no real email is sent). */
export class OutboxService {
  constructor(private readonly deps: { outbox: OutboxRepository }) {}

  async list(query: OutboxQuery): Promise<OutboxResponse> {
    const records = await this.deps.outbox.list({
      ...(query.bookingId ? { bookingId: query.bookingId } : {}),
      limit: query.limit,
    });
    return {
      entries: records.map((r) => ({
        bookingId: r.bookingId,
        startUtc: iso(r.startUtc),
        childName: r.childName,
        mentorName: r.mentorName,
        parentTimezone: r.parentTimezone,
        mentorTimezone: r.mentorTimezone,
        sentAt: iso(r.sentAt),
        parent: r.parent,
        mentor: r.mentor,
      })),
    };
  }
}
