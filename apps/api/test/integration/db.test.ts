import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { migrate } from '../../src/db/migrate.js';
import { seed } from '../../src/db/seed.js';
import { SEED_BOOKINGS, SEED_MENTORS } from '../../src/db/seedData.js';
import { createBookingRepository, insertBooking } from '../../src/repositories/bookingRepo.js';
import { createMentorRepository } from '../../src/repositories/mentorRepo.js';
import { createTestPool, truncateAll } from '../helpers/testDb.js';

const pool = createTestPool();
const now = DateTime.fromISO('2026-11-12T09:00:00Z', { zone: 'utc' });

afterAll(() => pool.end());
beforeEach(() => truncateAll(pool));

describe('migrate', () => {
  it('is idempotent: a second run applies nothing', async () => {
    expect(await migrate(pool)).toEqual([]);
    const { rows } = await pool.query('SELECT name FROM schema_migrations ORDER BY name');
    expect(rows.map((r) => r.name)).toEqual(['001_init.sql']);
  });

  it('runs the session in UTC', async () => {
    const { rows } = await pool.query('SHOW timezone');
    expect(rows[0].TimeZone).toBe('UTC');
  });
});

describe('seed', () => {
  it('can run twice: reset and reseed, same counts, no errors', async () => {
    const first = await seed(pool, now, 2);
    const second = await seed(pool, now, 2);
    expect(second).toEqual(first);
    expect(first).toEqual({ mentors: 10, bookings: SEED_BOOKINGS.length });

    const counts = await pool.query(`
      SELECT (SELECT count(*) FROM mentors)::int AS mentors,
             (SELECT count(*) FROM availability_windows)::int AS windows,
             (SELECT count(*) FROM bookings)::int AS bookings,
             (SELECT count(*) FROM outbox_messages)::int AS emails`);
    const windowCount = SEED_MENTORS.reduce((n, m) => n + m.windows.length, 0);
    expect(counts.rows[0]).toEqual({
      mentors: 10,
      windows: windowCount,
      bookings: SEED_BOOKINGS.length,
      emails: SEED_BOOKINGS.length * 2, // a parent and a mentor email per demo booking
    });
  });

  it('stored bookings respect the cap per mentor and shift date', async () => {
    await seed(pool, now, 2);
    const { rows } = await pool.query(
      `SELECT max(n)::int AS max FROM (
         SELECT count(*) AS n FROM bookings WHERE status = 'confirmed' GROUP BY mentor_id, shift_date
       ) t`,
    );
    expect(rows[0].max).toBeLessThanOrEqual(2);
  });

  it('round-trips schedules and bookings through the repositories', async () => {
    await seed(pool, now, 2);
    const mentors = await createMentorRepository(pool).listWithSchedules();
    const ananya = mentors.find((m) => m.name === 'Ananya Iyer')!;
    expect(ananya.timezone).toBe('Asia/Kolkata');
    expect(ananya.schedule.windows).toHaveLength(7);
    expect(ananya.schedule.windows[0]).toMatchObject({
      weekday: 1,
      startLocal: '20:30',
      durationMin: 300,
    });

    const booked = await createBookingRepository(pool).listBookedSlots({
      startUtc: now,
      endUtc: now.plus({ days: 3 }),
    });
    expect(booked).toHaveLength(SEED_BOOKINGS.length);
    const first = booked.find((b) => b.mentorId === ananya.id)!;
    // shift_date comes back as a plain calendar date string, not a shifted JS Date.
    expect(first.shiftDate).toBe('2026-11-13');
    expect(first.startUtc.toISO()).toBe('2026-11-13T15:00:00.000Z');
    expect(first.startUtc.zoneName).toBe('UTC');
  });
});

describe('constraints', () => {
  it('the partial unique index rejects a second confirmed booking for the same mentor and start', async () => {
    await seed(pool, now, 2);
    const { rows } = await pool.query(
      `SELECT * FROM bookings ORDER BY start_utc, mentor_id LIMIT 1`,
    );
    const b = rows[0];
    await expect(
      insertBooking(pool, {
        id: '11111111-1111-4111-8111-111111111111',
        mentorId: b.mentor_id,
        startUtc: DateTime.fromJSDate(b.start_utc, { zone: 'utc' }),
        endUtc: DateTime.fromJSDate(b.end_utc, { zone: 'utc' }),
        shiftDate: b.shift_date,
        parentName: 'Someone Else',
        parentEmail: 'else@example.com',
        parentEmailNorm: 'else@example.com',
        childName: 'Kid',
        childNameNorm: 'kid',
        childGrade: 3,
        phone: null,
        parentTimezone: 'Europe/London',
        classLink: 'https://class.example.com/trial/x',
      }),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('rejects a grade outside 1–12 and an end time that is not start + 60 min', async () => {
    await seed(pool, now, 2);
    const mentorId = SEED_MENTORS[0]!.id;
    const insert = (grade: number, endOffsetMin: number) =>
      pool.query(
        `INSERT INTO bookings (id, mentor_id, start_utc, end_utc, shift_date, parent_name, parent_email,
           parent_email_norm, child_name, child_name_norm, child_grade, parent_timezone, class_link)
         VALUES (gen_random_uuid(), $1, '2026-12-01T15:00Z', '2026-12-01T15:00Z'::timestamptz + make_interval(mins => $3),
           '2026-12-01', 'P', 'p@example.com', 'p@example.com', 'C', 'c', $2, 'Europe/London', 'x')`,
        [mentorId, grade, endOffsetMin],
      );
    await expect(insert(13, 60)).rejects.toMatchObject({ code: '23514' });
    await expect(insert(5, 90)).rejects.toMatchObject({ code: '23514' });
    await expect(insert(5, 60)).resolves.toBeDefined();
  });
});
