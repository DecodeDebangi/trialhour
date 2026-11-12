import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { eligibleMentorSlots, indexBookings } from '../domain/availability.js';
import { classLinkFor } from '../domain/classLink.js';
import { normalizeIdentityPart } from '../domain/parentIdentity.js';
import { assertValidSchedule, mentorSlotAt, slotsForWindow } from '../domain/slots.js';
import type { BookedSlot, MentorSchedule } from '../domain/types.js';
import { insertBooking, type NewBooking } from '../repositories/bookingRepo.js';
import { insertMentor } from '../repositories/mentorRepo.js';
import type { Pool } from './pool.js';
import { SEED_BOOKINGS, SEED_MENTORS, type SeedBooking, type SeedMentor } from './seedData.js';
import { withTransaction } from './tx.js';

export function scheduleOf(mentor: SeedMentor): MentorSchedule {
  return {
    mentorId: mentor.id,
    timezone: mentor.timezone,
    windows: mentor.windows.map((w, i) => ({ ...w, id: `${mentor.key}-${i}` })),
  };
}

/** Throws if any seed schedule breaks SPEC A4 within the next year. */
export function validateSeedMentors(mentors: readonly SeedMentor[], now: DateTime): void {
  for (const mentor of mentors) {
    const fromDate = now.setZone(mentor.timezone).toISODate() as string;
    assertValidSchedule(scheduleOf(mentor), { fromDate, days: 366 });
  }
}

/**
 * Turns the relative seed bookings into concrete rows using the same domain functions the app
 * uses: slot times from the mentor's window, shift date via mentorSlotAt, and the busy/cap
 * check via eligibleMentorSlots against the bookings planned so far. Any rule break throws.
 */
export function planSeedBookings(
  mentors: readonly SeedMentor[],
  bookings: readonly SeedBooking[],
  now: DateTime,
  dailyCap: number,
): NewBooking[] {
  const planned: BookedSlot[] = [];
  const rows: NewBooking[] = [];

  for (const b of bookings) {
    const where = `seed booking ${b.mentor} +${b.shiftOffsetDays}d slot ${b.slot}`;
    const mentor = mentors.find((m) => m.key === b.mentor);
    if (!mentor) throw new Error(`${where}: unknown mentor`);
    const schedule = scheduleOf(mentor);

    const shiftDay = now.setZone(mentor.timezone).startOf('day').plus({ days: b.shiftOffsetDays });
    const shiftDate = shiftDay.toISODate() as string;
    const window = schedule.windows.find((w) => w.weekday === shiftDay.weekday);
    if (!window) throw new Error(`${where}: ${mentor.name} has no shift on ${shiftDate}`);
    const slot = slotsForWindow(schedule, window, shiftDate)[b.slot];
    if (!slot) throw new Error(`${where}: shift on ${shiftDate} has no slot ${b.slot}`);

    if (mentorSlotAt(schedule, slot.startUtc)?.shiftDate !== shiftDate) {
      throw new Error(`${where}: shift date does not resolve to ${shiftDate}`);
    }
    if (slot.startUtc <= now) throw new Error(`${where}: starts in the past`);
    if (eligibleMentorSlots([slot], indexBookings(planned), dailyCap).length === 0) {
      throw new Error(`${where}: breaks our rules (mentor busy or at the daily cap)`);
    }

    planned.push({ mentorId: mentor.id, startUtc: slot.startUtc, shiftDate });
    const id = randomUUID();
    rows.push({
      id,
      mentorId: mentor.id,
      startUtc: slot.startUtc,
      endUtc: slot.endUtc,
      shiftDate,
      parentName: b.parent.name,
      parentEmail: b.parent.email,
      parentEmailNorm: normalizeIdentityPart(b.parent.email),
      childName: b.child.name,
      childNameNorm: normalizeIdentityPart(b.child.name),
      childGrade: b.child.grade,
      phone: null,
      parentTimezone: b.parent.timezone,
      classLink: classLinkFor(id),
    });
  }
  return rows;
}

/** Resets all app data and reseeds it in one transaction. Safe to run any number of times. */
export async function seed(
  pool: Pool,
  now: DateTime,
  dailyCap: number,
): Promise<{ mentors: number; bookings: number }> {
  validateSeedMentors(SEED_MENTORS, now);
  const bookings = planSeedBookings(SEED_MENTORS, SEED_BOOKINGS, now, dailyCap);

  await withTransaction(pool, async (client) => {
    await client.query(
      'TRUNCATE outbox_messages, idempotency_keys, bookings, availability_windows, mentors',
    );
    for (const mentor of SEED_MENTORS) await insertMentor(client, mentor, scheduleOf(mentor));
    for (const booking of bookings) await insertBooking(client, booking);
  });
  return { mentors: SEED_MENTORS.length, bookings: bookings.length };
}
