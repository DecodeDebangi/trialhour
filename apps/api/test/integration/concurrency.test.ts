import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../../src/db/pool.js';
import { insertMentor } from '../../src/repositories/mentorRepo.js';
import type { MentorSchedule } from '../../src/domain/types.js';
import { TEST_DATABASE_URL, createTestPool, truncateAll } from '../helpers/testDb.js';
import { bookingBody, listen, mentorId, seededApp } from '../helpers/testApp.js';

/**
 * X1/X2 (SPEC §11). Every request goes over real HTTP to a real server whose pool has more
 * connections than there are requests, so each booking transaction gets its own Postgres
 * session. Gated runs prove it: a separate connection holds an ACCESS EXCLUSIVE lock on
 * `bookings`, we wait until pg_stat_activity shows *every* request's transaction blocked inside
 * Postgres at the same moment, then release the gate and let them race.
 */
const REQUESTS = 20;
const appPool = createPool(TEST_DATABASE_URL, REQUESTS + 10);
const admin = createTestPool();

afterAll(async () => {
  await appPool.end();
  await admin.end();
});

const NOW = '2027-03-20T00:00:00Z';
const SLOT = '2027-03-27T17:00:00Z'; // 22:30 India, UK-evening shift of 27 Mar (M1–M3)

type Result = { status: number; body: { mentor?: { id: string }; error?: { details?: unknown } } };

function fire(url: string, starts: string[]): Promise<Result[]> {
  return Promise.all(
    starts.map(async (startUtc, i) => {
      const res = await fetch(`${url}/api/bookings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify(
          bookingBody(startUtc, { parentEmail: `p${i}@example.com`, childName: `Child ${i}` }),
        ),
      });
      return { status: res.status, body: (await res.json()) as Result['body'] };
    }),
  );
}

/** Polls until `expected` sessions other than the gate are blocked on a lock; returns the peak. */
async function waitForBlockedSessions(gatePid: number, expected: number): Promise<number> {
  let peak = 0;
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const { rows } = await admin.query<{ n: number }>(
      `SELECT count(DISTINCT pid)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> $1
          AND state = 'active' AND wait_event_type = 'Lock'`,
      [gatePid],
    );
    peak = Math.max(peak, rows[0]!.n);
    if (peak >= expected) return peak;
    await new Promise((r) => setTimeout(r, 10));
  }
  return peak;
}

/** Fires the requests while a gate holds every transaction at its bookings read. */
async function gatedRace(url: string, starts: string[]) {
  const gate = await admin.connect();
  await gate.query('BEGIN');
  await gate.query('LOCK TABLE bookings IN ACCESS EXCLUSIVE MODE');
  const { rows } = await gate.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
  const inflight = fire(url, starts);
  const blocked = await waitForBlockedSessions(rows[0]!.pid, starts.length);
  await gate.query('ROLLBACK');
  gate.release();
  return { blocked, results: await inflight };
}

const statuses = (results: Result[]) => results.map((r) => r.status).sort();

/** Idempotency and outbox rows reference bookings, so clear them first. */
async function clearBookings(sql: string, params: unknown[] = []) {
  await admin.query('DELETE FROM idempotency_keys');
  await admin.query('DELETE FROM outbox_messages');
  await admin.query(sql, params);
}

describe('X1: 20 parents race for one slot that 3 mentors cover', () => {
  let server: Awaited<ReturnType<typeof listen>>;
  beforeAll(async () => {
    const { app } = await seededApp(appPool, NOW);
    server = await listen(app);
  });
  afterAll(() => server.close());

  const check = (results: Result[]) => {
    expect(statuses(results)).toEqual([...Array(3).fill(201), ...Array(REQUESTS - 3).fill(409)]);
    const winners = results.filter((r) => r.status === 201).map((r) => r.body.mentor!.id);
    expect(new Set(winners)).toEqual(new Set(['M1', 'M2', 'M3'].map(mentorId)));
    const losers = results.filter((r) => r.status === 409);
    expect(
      losers.every((r) => (r.body.error!.details as { reason: string }).reason === 'FULLY_BOOKED'),
    ).toBe(true);
  };

  it('gated: all 20 transactions are in flight at once on separate connections; exactly 3 win', async () => {
    await clearBookings('DELETE FROM bookings WHERE start_utc = $1', [SLOT]);
    const { blocked, results } = await gatedRace(server.url, Array(REQUESTS).fill(SLOT));
    expect(blocked).toBe(REQUESTS);
    check(results);
  });

  it('ungated, repeated 20 times: always exactly 3 × 201 on 3 distinct mentors', async () => {
    for (let run = 0; run < 20; run++) {
      await clearBookings('DELETE FROM bookings WHERE start_utc = $1', [SLOT]);
      check(await fire(server.url, Array(REQUESTS).fill(SLOT)));
    }
  });
});

describe('X2: the daily-cap race (different slots, one mentor)', () => {
  // One mentor, 3 consecutive slots in one shift: 15:00Z, 16:00Z, 17:00Z on 27 Mar.
  const SOLO = '00000000-0000-4000-8000-0000000000aa';
  const solo: MentorSchedule = {
    mentorId: SOLO,
    timezone: 'Asia/Kolkata',
    windows: [{ id: 'solo', weekday: 6, startLocal: '20:30', durationMin: 180 }],
  };
  const SLOTS = ['2027-03-27T15:00:00Z', '2027-03-27T16:00:00Z', '2027-03-27T17:00:00Z'];
  const REQUESTS_X2 = SLOTS.flatMap((s) => [s, s]); // 6 requests, 2 per slot
  let server: Awaited<ReturnType<typeof listen>>;

  beforeAll(async () => {
    await truncateAll(admin);
    await insertMentor(
      admin,
      {
        id: SOLO,
        name: 'Solo Mentor',
        email: 'solo@mentors.example.com',
        timezone: 'Asia/Kolkata',
      },
      solo,
    );
    const { app } = await seededApp(appPool, NOW, { skipSeed: true });
    server = await listen(app);
  });
  afterAll(() => server.close());

  const shiftCount = async () =>
    (
      await admin.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM bookings
          WHERE mentor_id = $1 AND shift_date = '2027-03-27' AND status = 'confirmed'`,
        [SOLO],
      )
    ).rows[0]!.n;

  const check = async (results: Result[]) => {
    expect(statuses(results)).toEqual([201, 201, 409, 409, 409, 409]);
    expect(await shiftCount()).toBe(2);
  };

  it('gated: all 6 in flight at once; exactly 2 succeed and the cap holds', async () => {
    await clearBookings('DELETE FROM bookings');
    const { blocked, results } = await gatedRace(server.url, REQUESTS_X2);
    expect(blocked).toBe(REQUESTS_X2.length);
    await check(results);
  });

  it('ungated, repeated 20 times: never more than 2 bookings in the shift', async () => {
    for (let run = 0; run < 20; run++) {
      await clearBookings('DELETE FROM bookings');
      await check(await fire(server.url, REQUESTS_X2));
    }
  });
});

describe('X3 and X5: one parent racing themselves', () => {
  const UK = (hh: number) => `2027-03-27T${hh}:00:00Z`;
  let server: Awaited<ReturnType<typeof listen>>;

  beforeAll(async () => {
    const { app } = await seededApp(appPool, NOW);
    server = await listen(app);
  });
  afterAll(() => server.close());

  /** Posts the given bodies in parallel; `keys` lets two requests share an Idempotency-Key. */
  function postAll(bodies: object[], keys: string[]): Promise<Result[]> {
    return Promise.all(
      bodies.map(async (body, i) => {
        const res = await fetch(`${server.url}/api/bookings`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'idempotency-key': keys[i]! },
          body: JSON.stringify(body),
        });
        return { status: res.status, body: (await res.json()) as Result['body'] };
      }),
    );
  }

  /** Same gate as above: hold every transaction in Postgres, then release them together. */
  async function gated(run: () => Promise<Result[]>, expectedBlocked: number) {
    const gate = await admin.connect();
    await gate.query('BEGIN');
    await gate.query('LOCK TABLE bookings IN ACCESS EXCLUSIVE MODE');
    const { rows } = await gate.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    const inflight = run();
    const blocked = await waitForBlockedSessions(rows[0]!.pid, expectedBlocked);
    await gate.query('ROLLBACK');
    gate.release();
    return { blocked, results: await inflight };
  }

  const bookingsFor = async (email: string) =>
    (
      await admin.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM bookings WHERE parent_email = $1',
        [email],
      )
    ).rows[0]!.n;

  describe('X3: the same request twice with the same Idempotency-Key (double tap, retry)', () => {
    const body = bookingBody(UK(15), { parentEmail: 'x3@example.com', childName: 'Leo' });

    const check = async (results: Result[]) => {
      expect(statuses(results)).toEqual([200, 201]);
      expect(results[0]!.body).toEqual(results[1]!.body); // one response replayed verbatim
      expect(await bookingsFor('x3@example.com')).toBe(1);
    };

    it('gated: both in flight at once → one booking, identical responses', async () => {
      await clearBookings("DELETE FROM bookings WHERE parent_email = 'x3@example.com'");
      const key = crypto.randomUUID();
      const { blocked, results } = await gated(() => postAll([body, body], [key, key]), 2);
      expect(blocked).toBe(2);
      await check(results);
    });

    it('ungated, repeated 20 times', async () => {
      for (let run = 0; run < 20; run++) {
        await clearBookings("DELETE FROM bookings WHERE parent_email = 'x3@example.com'");
        const key = crypto.randomUUID();
        await check(await postAll([body, body], [key, key]));
      }
    });
  });

  describe('X5: the same child booked into two different slots at once', () => {
    const bodies = [UK(15), UK(17)].map((start) =>
      bookingBody(start, { parentEmail: 'x5@example.com', childName: 'Maya' }),
    );

    const check = async (results: Result[]) => {
      expect(statuses(results)).toEqual([201, 409]);
      const loser = results.find((r) => r.status === 409)!;
      expect((loser.body as { error: { code: string } }).error.code).toBe('DUPLICATE_TRIAL');
      expect(await bookingsFor('x5@example.com')).toBe(1);
    };

    it('gated: both in flight at once → exactly one trial, the other gets DUPLICATE_TRIAL', async () => {
      await clearBookings("DELETE FROM bookings WHERE parent_email = 'x5@example.com'");
      const { blocked, results } = await gated(
        () => postAll(bodies, [crypto.randomUUID(), crypto.randomUUID()]),
        2,
      );
      expect(blocked).toBe(2);
      await check(results);
    });

    it('ungated, repeated 20 times', async () => {
      for (let run = 0; run < 20; run++) {
        await clearBookings("DELETE FROM bookings WHERE parent_email = 'x5@example.com'");
        await check(await postAll(bodies, [crypto.randomUUID(), crypto.randomUUID()]));
      }
    });
  });
});
