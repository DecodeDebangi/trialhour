import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { DateTime } from 'luxon';
import type { Express } from 'express';
import {
  bookingResponseSchema,
  duplicateTrialResponseSchema,
  outboxResponseSchema,
  slotUnavailableResponseSchema,
} from '@codeyoung/shared';
import { createBookingRepository } from '../../src/repositories/bookingRepo.js';
import { MentorSlotTakenError } from '../../src/repositories/errors.js';
import { createTestPool } from '../helpers/testDb.js';
import { bookDirect, bookingBody, mentorId, mentorName, seededApp } from '../helpers/testApp.js';

const pool = createTestPool();
afterAll(() => pool.end());

// Sat 20 Mar 2027, 00:00Z. Seed bookings land on 21 Mar; our tests use the 27 Mar UK shift.
const NOW = '2027-03-20T00:00:00Z';
// UK-evening shift that starts Sat 27 Mar, 20:30 India time: 15:00Z … 19:00Z. M1–M3 cover it.
const UK = (hh: number) => `2027-03-27T${String(hh).padStart(2, '0')}:00:00Z`;
const UK_IDS = ['M1', 'M2', 'M3'].map(mentorId);

const post = (app: Express, body: object, key: string = crypto.randomUUID()) =>
  request(app).post('/api/bookings').set('Idempotency-Key', key).send(body);

describe('POST /api/bookings — happy path', () => {
  it('books, assigns an eligible mentor and returns the confirmation', async () => {
    const { app } = await seededApp(pool, NOW);
    const res = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', crypto.randomUUID())
      .send(bookingBody(UK(15)));
    expect(res.status).toBe(201);
    const booking = bookingResponseSchema.parse(res.body);
    expect(booking).toMatchObject({
      startUtc: '2027-03-27T15:00:00Z',
      endUtc: '2027-03-27T16:00:00Z',
      parentTimezone: 'Europe/London',
      parent: { name: 'Emma Clarke', email: 'emma@example.com' },
      child: { name: 'Oliver', grade: 4 },
      classLink: `https://class.example.com/trial/${booking.id}`,
    });
    expect(UK_IDS).toContain(booking.mentor.id);
    expect(booking.mentor.timezone).toBe('Asia/Kolkata');

    const stored = await pool.query('SELECT shift_date FROM bookings WHERE id = $1', [booking.id]);
    expect(stored.rows[0].shift_date).toBe('2027-03-27');
  });

  it('GET /api/bookings/:id returns the same confirmation', async () => {
    const { app } = await seededApp(pool, NOW);
    const created = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', crypto.randomUUID())
      .send(bookingBody(UK(15)));
    const fetched = await request(app).get(`/api/bookings/${created.body.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(created.body);
  });

  it('GET unknown id → 404; malformed id → 422', async () => {
    const { app } = await seededApp(pool, NOW);
    const missing = await request(app).get('/api/bookings/6f1c2b1e-0000-4000-8000-000000000999');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
    expect((await request(app).get('/api/bookings/abc')).status).toBe(422);
  });
});

describe('POST /api/bookings — capacity rules', () => {
  it('C1: two bookings either side of India midnight fill one shift; next evening is a new shift', async () => {
    const { app } = await seededApp(pool, NOW);
    await bookDirect(pool, 'M1', UK(18)); // 23:30 India, 27 Mar
    await bookDirect(pool, 'M1', UK(19)); // 00:30 India, 28 Mar — same shift
    const shifts = await pool.query(
      'SELECT DISTINCT shift_date FROM bookings WHERE mentor_id = $1 AND start_utc >= $2',
      [mentorId('M1'), UK(15)],
    );
    expect(shifts.rows).toEqual([{ shift_date: '2027-03-27' }]);

    const third = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', crypto.randomUUID())
      .send(bookingBody(UK(17)));
    expect(third.status).toBe(201);
    expect(third.body.mentor.id).not.toBe(mentorId('M1'));

    // Sun 28 Mar, 20:30 India time: M2 and M3 are taken, M1 has a fresh shift.
    const nextEvening = '2027-03-28T15:00:00Z';
    await bookDirect(pool, 'M2', nextEvening);
    await bookDirect(pool, 'M3', nextEvening);
    const res = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', crypto.randomUUID())
      .send(bookingBody(nextEvening, { childName: 'Amelia' }));
    expect(res.status).toBe(201);
    expect(res.body.mentor).toEqual({
      id: mentorId('M1'),
      name: mentorName('M1'),
      timezone: 'Asia/Kolkata',
    });
  });

  it('C3: preferred mentor busy at the slot → quietly assigned to another, no 409', async () => {
    const { app } = await seededApp(pool, NOW);
    // With nobody booked, capacity-preserving ties on scarcity and bookings → M1 by id.
    const first = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', crypto.randomUUID())
      .send(bookingBody(UK(15)));
    expect(first.body.mentor.id).toBe(mentorId('M1'));
    const second = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', crypto.randomUUID())
      .send(bookingBody(UK(15), { parentEmail: 'other@example.com', childName: 'Amelia' }));
    expect(second.status).toBe(201);
    expect([mentorId('M2'), mentorId('M3')]).toContain(second.body.mentor.id);
  });

  it('C4 + C10: every covering mentor busy → 409 FULLY_BOOKED with the 5 nearest alternatives', async () => {
    const { app } = await seededApp(pool, NOW);
    for (const key of ['M1', 'M2', 'M3']) await bookDirect(pool, key, UK(16));
    const res = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', crypto.randomUUID())
      .send(bookingBody(UK(16)));
    expect(res.status).toBe(409);
    expect(slotUnavailableResponseSchema.parse(res.body)).toEqual({
      error: {
        code: 'SLOT_UNAVAILABLE',
        message: 'Sorry, that time has just been taken.',
        details: { reason: 'FULLY_BOOKED' },
      },
      // Same London day, closest first (15:00 and 17:00 tie at 1h; earlier wins), then 18, 19, 20.
      alternatives: [15, 17, 18, 19, 20].map((h) => ({
        startUtc: UK(h),
        endUtc: `2027-03-27T${String(h + 1).padStart(2, '0')}:00:00Z`,
      })),
    });
  });

  it('C2: every covering mentor at the cap → 409 DAILY_LIMIT_REACHED', async () => {
    const { app } = await seededApp(pool, NOW);
    for (const key of ['M1', 'M2', 'M3']) {
      await bookDirect(pool, key, UK(15));
      await bookDirect(pool, key, UK(16));
    }
    const res = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', crypto.randomUUID())
      .send(bookingBody(UK(17)));
    expect(res.status).toBe(409);
    expect(res.body.error.details).toEqual({ reason: 'DAILY_LIMIT_REACHED' });
  });

  it('C7: inside the 4h notice → 409 TOO_SOON', async () => {
    const { app } = await seededApp(pool, NOW);
    // 02:00Z = 07:30 India time, US-West shift, 2h from now.
    const res = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', crypto.randomUUID())
      .send(bookingBody('2027-03-20T02:00:00Z'));
    expect(res.status).toBe(409);
    expect(res.body.error.details).toEqual({ reason: 'TOO_SOON' });
  });
});

describe('POST /api/bookings — duplicate trials (C9)', () => {
  it('same email + child with an upcoming trial → 409 DUPLICATE_TRIAL with that booking', async () => {
    const { app } = await seededApp(pool, NOW);
    const first = await post(app, bookingBody(UK(15)));
    expect(first.status).toBe(201);

    // Different case and spacing still match.
    const again = await post(
      app,
      bookingBody(UK(17), { parentEmail: ' Emma@Example.COM ', childName: '  oliver ' }),
    );
    expect(again.status).toBe(409);
    expect(duplicateTrialResponseSchema.parse(again.body)).toEqual({
      error: { code: 'DUPLICATE_TRIAL', message: 'Oliver already has a trial class booked.' },
      existingBooking: {
        id: first.body.id,
        startUtc: UK(15),
        endUtc: UK(16),
        childName: 'Oliver',
      },
    });
  });

  it('same email, different child → 201 (one trial per child)', async () => {
    const { app } = await seededApp(pool, NOW);
    expect((await post(app, bookingBody(UK(15)))).status).toBe(201);
    expect((await post(app, bookingBody(UK(17), { childName: 'Amelia' }))).status).toBe(201);
  });

  it('a trial in progress also blocks a second one (end_utc > now)', async () => {
    const { app, clock } = await seededApp(pool, NOW);
    const first = await post(app, bookingBody(UK(15)));
    expect(first.status).toBe(201);
    clock.set('2027-03-27T15:30:00Z'); // halfway through the first trial
    const again = await post(app, bookingBody('2027-03-28T15:00:00Z'));
    expect(again.status).toBe(409);
    expect(again.body.existingBooking.id).toBe(first.body.id);
  });

  it('allowed again once the first trial is in the past', async () => {
    const { app, clock } = await seededApp(pool, NOW);
    expect((await post(app, bookingBody(UK(15)))).status).toBe(201);
    clock.set('2027-03-27T16:30:00Z'); // the first trial has ended
    expect((await post(app, bookingBody('2027-03-28T15:00:00Z'))).status).toBe(201);
  });
});

describe('POST /api/bookings — idempotency', () => {
  it('requires an Idempotency-Key header (400) that is a UUID (422)', async () => {
    const { app } = await seededApp(pool, NOW);
    const missing = await request(app)
      .post('/api/bookings')
      .send(bookingBody(UK(15)));
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('IDEMPOTENCY_KEY_MISSING');
    const malformed = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', 'not-a-uuid')
      .send(bookingBody(UK(15)));
    expect(malformed.status).toBe(422);
  });

  it('a retry with the same key and body replays the original booking (200), creating nothing new', async () => {
    const { app } = await seededApp(pool, NOW);
    const key = crypto.randomUUID();
    const first = await post(app, bookingBody(UK(15)), key);
    const retry = await post(app, bookingBody(UK(15)), key);
    expect([first.status, retry.status]).toEqual([201, 200]);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body).toEqual(first.body);
    const count = await pool.query(
      "SELECT count(*)::int AS n FROM bookings WHERE parent_email = 'emma@example.com'",
    );
    expect(count.rows[0].n).toBe(1);
  });

  it('X4: same key, different body → 422 IDEMPOTENCY_KEY_REUSED', async () => {
    const { app } = await seededApp(pool, NOW);
    const key = crypto.randomUUID();
    expect((await post(app, bookingBody(UK(15)), key)).status).toBe(201);
    const reused = await post(app, bookingBody(UK(17), { childName: 'Amelia' }), key);
    expect(reused.status).toBe(422);
    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('a failed attempt does not consume the key: the same key can succeed later', async () => {
    const { app } = await seededApp(pool, NOW);
    for (const key of ['M1', 'M2', 'M3']) await bookDirect(pool, key, UK(16));
    const idem = crypto.randomUUID();
    expect((await post(app, bookingBody(UK(16)), idem)).status).toBe(409);
    await pool.query('DELETE FROM bookings WHERE start_utc = $1', [UK(16)]);
    expect((await post(app, bookingBody(UK(16)), idem)).status).toBe(201);
  });
});

describe('outbox and calendar (X6)', () => {
  const outboxFor = (id: string) =>
    pool.query<{ recipient: string; to_email: string; subject: string; body_text: string }>(
      'SELECT recipient, to_email, subject, body_text FROM outbox_messages WHERE booking_id = $1 ORDER BY recipient DESC',
      [id],
    );

  it('X6: every 201 writes exactly 2 emails: parent in their zone, mentor in India time + parent time', async () => {
    const { app } = await seededApp(pool, NOW);
    const res = await post(
      app,
      bookingBody(UK(15), { parentTimezone: 'America/New_York', parentEmail: 'ny@example.com' }),
    );
    expect(res.status).toBe(201);
    const { rows } = await outboxFor(res.body.id);
    expect(rows.map((r) => [r.recipient, r.to_email])).toEqual([
      ['parent', 'ny@example.com'],
      ['mentor', `${res.body.mentor.name.split(' ')[0].toLowerCase()}@mentors.example.com`],
    ]);
    // 15:00Z on Sat 27 Mar 2027: New York is already on DST (GMT-4); India is 20:30.
    expect(rows[0]!.body_text).toContain('When: Sat 27 Mar, 11:00 AM New York time (GMT-4)');
    expect(rows[1]!.body_text).toContain('When: Sat 27 Mar, 8:30 PM India time (GMT+5:30)');
    expect(rows[1]!.body_text).toContain(
      "Parent's time: Sat 27 Mar, 11:00 AM New York time (GMT-4)",
    );
  });

  it('X6: a 409 writes no emails, and an idempotent replay writes no extra ones', async () => {
    const { app } = await seededApp(pool, NOW);
    const count = async () =>
      (await pool.query('SELECT count(*)::int AS n FROM outbox_messages')).rows[0].n as number;
    const before = await count();

    for (const key of ['M1', 'M2', 'M3']) await bookDirect(pool, key, UK(16));
    expect((await post(app, bookingBody(UK(16)))).status).toBe(409);
    expect(await count()).toBe(before);

    const idem = crypto.randomUUID();
    expect((await post(app, bookingBody(UK(17)), idem)).status).toBe(201);
    expect((await post(app, bookingBody(UK(17)), idem)).status).toBe(200);
    expect(await count()).toBe(before + 2);
  });

  it('GET /api/bookings/:id/calendar.ics returns an attachment with UTC times', async () => {
    const { app } = await seededApp(pool, NOW);
    const created = await post(app, bookingBody(UK(15)));
    expect(created.body.icsUrl).toBe(`/api/bookings/${created.body.id}/calendar.ics`);
    const res = await request(app).get(created.body.icsUrl);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/calendar; charset=utf-8');
    expect(res.headers['content-disposition']).toBe('attachment; filename="trial-class.ics"');
    const text = res.text.replace(/\r\n /g, '');
    expect(text).toContain('DTSTART:20270327T150000Z');
    expect(text).toContain('DTEND:20270327T160000Z');
    expect(text).toContain(`UID:${created.body.id}@trialhour.example.com`);
    expect(
      (await request(app).get('/api/bookings/6f1c2b1e-0000-4000-8000-000000000999/calendar.ics'))
        .status,
    ).toBe(404);
  });
});

describe('a class whose hour spans the US clock change (§6 edge case)', () => {
  it('06:00Z on Sun 14 Mar 2027 ends at 07:00Z in the API, the .ics and the email', async () => {
    const { app } = await seededApp(pool, '2027-03-10T00:00:00Z');
    const res = await post(
      app,
      bookingBody('2027-03-14T06:00:00Z', { parentTimezone: 'America/New_York' }),
    );
    expect(res.status).toBe(201);
    expect([res.body.startUtc, res.body.endUtc]).toEqual([
      '2027-03-14T06:00:00Z',
      '2027-03-14T07:00:00Z',
    ]);
    // On New York clocks that hour reads 1:00 AM (GMT-5) → 3:00 AM (GMT-4).
    const ics = (await request(app).get(res.body.icsUrl)).text.replace(/\r\n /g, '');
    expect(ics).toContain('DTSTART:20270314T060000Z');
    expect(ics).toContain('DTEND:20270314T070000Z');
    const email = await pool.query(
      "SELECT body_text FROM outbox_messages WHERE booking_id = $1 AND recipient = 'parent'",
      [res.body.id],
    );
    expect(email.rows[0].body_text).toContain('When: Sun 14 Mar, 1:00 AM New York time (GMT-5)');
  });
});

describe('GET /api/outbox', () => {
  it('lists the seeded bookings’ emails, newest first, each as a parent + mentor pair', async () => {
    const { app } = await seededApp(pool, NOW);
    const res = await request(app).get('/api/outbox');
    expect(res.status).toBe(200);
    const { entries } = outboxResponseSchema.parse(res.body);
    expect(entries).toHaveLength(11); // one pair per seeded booking
    const emma = entries.find((e) => e.parent.to === 'emma.clarke@example.com')!;
    expect(emma.parentTimezone).toBe('Europe/London');
    expect(emma.mentorTimezone).toBe('Asia/Kolkata');
    expect(emma.mentor.subject).toMatch(/^New trial class: .* India time \(GMT\+5:30\)$/);
  });

  it('filters to one booking, and puts a new booking first', async () => {
    const { app } = await seededApp(pool, NOW);
    const created = await post(app, bookingBody(UK(15)));
    const all = outboxResponseSchema.parse((await request(app).get('/api/outbox')).body);
    expect(all.entries[0]!.bookingId).toBe(created.body.id);

    const one = await request(app).get('/api/outbox').query({ bookingId: created.body.id });
    expect(outboxResponseSchema.parse(one.body).entries.map((e) => e.bookingId)).toEqual([
      created.body.id,
    ]);
    expect((await request(app).get('/api/outbox').query({ bookingId: 'nope' })).status).toBe(422);
  });
});

describe('POST /api/bookings — validation (422 / 400)', () => {
  it.each([
    ['off the hour grid (C8)', bookingBody('2027-03-27T15:30:00Z'), 'startUtc'],
    ['no mentor works then (C8)', bookingBody('2027-03-27T13:00:00Z'), 'startUtc'],
    ['beyond 14 days (C7)', bookingBody('2027-04-10T15:00:00Z'), undefined],
    ['start without offset', bookingBody('2027-03-27T15:00:00'), 'startUtc'],
    ['abbreviated zone', bookingBody(UK(15), { parentTimezone: 'EST' }), 'parentTimezone'],
    ['bad email', bookingBody(UK(15), { parentEmail: 'not-an-email' }), 'parentEmail'],
    ['grade 13', bookingBody(UK(15), { childGrade: 13 }), 'childGrade'],
    ['blank child name', bookingBody(UK(15), { childName: '   ' }), 'childName'],
    ['bad phone', bookingBody(UK(15), { phone: '07700 900123' }), 'phone'],
  ])('%s → 422', async (_label, body, path) => {
    const { app } = await seededApp(pool, NOW);
    const res = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', crypto.randomUUID())
      .send(body);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    if (path) {
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path })]),
      );
    }
  });

  it('malformed JSON → 400 INVALID_JSON', async () => {
    const { app } = await seededApp(pool, NOW);
    const res = await request(app)
      .post('/api/bookings')
      .set('Content-Type', 'application/json')
      .send('{"startUtc":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('nothing is written when a request is rejected', async () => {
    const { app } = await seededApp(pool, NOW);
    const before = await pool.query('SELECT count(*)::int AS n FROM bookings');
    await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', crypto.randomUUID())
      .send(bookingBody('2027-03-27T15:30:00Z'));
    const after = await pool.query('SELECT count(*)::int AS n FROM bookings');
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});

describe('backstop and timeouts', () => {
  it('the repository turns a unique-index violation into MentorSlotTakenError', async () => {
    await seededApp(pool, NOW);
    await bookDirect(pool, 'M1', UK(15));
    const start = DateTime.fromISO(UK(15), { zone: 'utc' });
    await expect(
      createBookingRepository(pool).insert({
        id: crypto.randomUUID(),
        mentorId: mentorId('M1'),
        startUtc: start,
        endUtc: start.plus({ hours: 1 }),
        shiftDate: '2027-03-27',
        parentName: 'P',
        parentEmail: 'p@example.com',
        parentEmailNorm: 'p@example.com',
        childName: 'C',
        childNameNorm: 'c',
        childGrade: 3,
        phone: null,
        parentTimezone: 'Europe/London',
        classLink: 'https://class.example.com/trial/x',
      }),
    ).rejects.toBeInstanceOf(MentorSlotTakenError);
  });

  it('a request stuck behind a held mentor lock gets 503 TRY_AGAIN after lock_timeout, not a hang', async () => {
    const { app } = await seededApp(pool, NOW, {
      transactionOptions: { lockTimeoutMs: 300, statementTimeoutMs: 5_000 },
    });
    const holder = await pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM mentors WHERE id = ANY($1::uuid[]) FOR UPDATE', [UK_IDS]);

      const started = Date.now();
      const res = await request(app)
        .post('/api/bookings')
        .set('Idempotency-Key', crypto.randomUUID())
        .send(bookingBody(UK(15)));
      const elapsed = Date.now() - started;
      expect(res.status).toBe(503);
      expect(res.headers['retry-after']).toBe('1');
      expect(res.body.error.code).toBe('TRY_AGAIN');
      expect(elapsed).toBeGreaterThanOrEqual(300);
      expect(elapsed).toBeLessThan(2_000);
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }
    // Once the lock is released, the same request succeeds.
    const retry = await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', crypto.randomUUID())
      .send(bookingBody(UK(15)));
    expect(retry.status).toBe(201);
  });

  it('timeouts are transaction-local and do not leak into pooled connections', async () => {
    const { app } = await seededApp(pool, NOW, {
      transactionOptions: { lockTimeoutMs: 300, statementTimeoutMs: 5_000 },
    });
    await request(app)
      .post('/api/bookings')
      .set('Idempotency-Key', crypto.randomUUID())
      .send(bookingBody(UK(15)));
    const results = await Promise.all(
      Array.from({ length: 5 }, () => pool.query('SHOW lock_timeout')),
    );
    expect(results.map((r) => r.rows[0].lock_timeout)).toEqual(Array(5).fill('0'));
  });
});
