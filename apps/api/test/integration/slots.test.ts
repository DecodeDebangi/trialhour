import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { localDateOf, slotsResponseSchema, type SlotsResponse } from '@codeyoung/shared';
import { createApp } from '../../src/app.js';
import { createTestPool } from '../helpers/testDb.js';
import { seededApp } from '../helpers/testApp.js';

const pool = createTestPool();
afterAll(() => pool.end());

// Thu 12 Nov 2026, 12:00Z = 5:30 PM India. Earliest bookable start: 16:00Z.
const NOW = '2026-11-12T12:00:00Z';

const day = (body: SlotsResponse, date: string) => body.days.find((d) => d.date === date)!;
const at = (body: SlotsResponse, date: string, hhmmUtc: string) =>
  day(body, date).slots.find((s) => s.startUtc.slice(11, 16) === hhmmUtc);

describe('GET /api/slots', () => {
  it('defaults to today … today + 14 days in the parent zone, listing every date', async () => {
    const { app } = await seededApp(pool, NOW);
    const res = await request(app).get('/api/slots').query({ tz: 'Europe/London' });
    expect(res.status).toBe(200);
    const body = slotsResponseSchema.parse(res.body);
    expect(body.timezone).toBe('Europe/London');
    expect(body.days.map((d) => d.date)).toHaveLength(15);
    expect(body.days[0]!.date).toBe('2026-11-12');
    expect(body.days.at(-1)!.date).toBe('2026-11-26');
  });

  it('greys out slots with the right reason, from the seeded bookings', async () => {
    const { app } = await seededApp(pool, NOW);
    const res = await request(app)
      .get('/api/slots')
      .query({ tz: 'Europe/London', from: '2026-11-12', to: '2026-11-13' });
    const body = slotsResponseSchema.parse(res.body);

    // Today's UK shift: 15:00Z is inside the 4h notice, 16:00Z onwards is open.
    expect(at(body, '2026-11-12', '15:00')).toEqual({
      startUtc: '2026-11-12T15:00:00Z',
      endUtc: '2026-11-12T16:00:00Z',
      available: false,
      reason: 'TOO_SOON',
    });
    expect(at(body, '2026-11-12', '16:00')).toEqual({
      startUtc: '2026-11-12T16:00:00Z',
      endUtc: '2026-11-12T17:00:00Z',
      available: true,
    });
    // 01:30 India tomorrow (20:00Z today): all three US-East mentors are booked.
    expect(at(body, '2026-11-12', '20:00')).toMatchObject({
      available: false,
      reason: 'FULLY_BOOKED',
    });
    // Tomorrow's UK shift: M1–M3 are all at the cap.
    for (const hhmm of ['15:00', '16:00', '17:00', '18:00', '19:00']) {
      expect(at(body, '2026-11-13', hhmm)).toMatchObject({
        available: false,
        reason: 'DAILY_LIMIT_REACHED',
      });
    }
  });

  it('hides past slots and never shows times outside every window', async () => {
    const { app } = await seededApp(pool, NOW);
    const res = await request(app)
      .get('/api/slots')
      .query({ tz: 'Europe/London', from: '2026-11-12', to: '2026-11-12' });
    const starts = (res.body as SlotsResponse).days[0]!.slots.map((s) => s.startUtc);
    expect(starts.every((s) => s >= NOW)).toBe(true);
    expect(starts).not.toContain('2026-11-12T13:00:00Z'); // no mentor covers 6:30 PM India
  });

  it('groups by the parent’s local date, sorted', async () => {
    const { app } = await seededApp(pool, NOW);
    const res = await request(app)
      .get('/api/slots')
      .query({ tz: 'America/New_York', from: '2026-11-13', to: '2026-11-14' });
    const body = slotsResponseSchema.parse(res.body);
    for (const d of body.days) {
      expect(d.slots.every((s) => localDateOf(s.startUtc, 'America/New_York') === d.date)).toBe(
        true,
      );
      const starts = d.slots.map((s) => s.startUtc);
      expect(starts).toEqual([...starts].sort());
    }
  });

  it('T1/T2 through the API: New York 14 Mar 2027 is a 23h day, US-East slots start at 4 PM', async () => {
    const { app } = await seededApp(pool, '2027-03-13T12:00:00Z');
    const res = await request(app)
      .get('/api/slots')
      .query({ tz: 'America/New_York', from: '2027-03-13', to: '2027-03-14' });
    const body = slotsResponseSchema.parse(res.body);
    const sat = day(body, '2027-03-13').slots.map((s) => s.startUtc);
    const sun = day(body, '2027-03-14').slots.map((s) => s.startUtc);
    expect(sat).toContain('2027-03-13T20:00:00Z'); // 3 PM EST
    expect(sun).toContain('2027-03-14T20:00:00Z'); // 4 PM EDT
    expect(sun[0]).toBe('2027-03-14T05:00:00Z');
    expect(sun.at(-1)! < '2027-03-15T04:00:00Z').toBe(true);
  });

  it('accepts Etc/UTC and legacy Asia/Calcutta', async () => {
    const { app } = await seededApp(pool, NOW);
    for (const tz of ['Etc/UTC', 'Asia/Calcutta']) {
      const res = await request(app)
        .get('/api/slots')
        .query({ tz, from: '2026-11-13', to: '2026-11-13' });
      expect(res.status).toBe(200);
    }
  });

  describe('validation (422 envelope)', () => {
    it.each([
      [{}, 'tz'],
      [{ tz: 'EST' }, 'tz'],
      [{ tz: 'IST' }, 'tz'],
      [{ tz: 'Europe/London', from: '2026-13-01' }, 'from'],
      [{ tz: 'Europe/London', from: '2026-11-20', to: '2026-11-13' }, 'from'],
    ])('rejects %o', async (query, path) => {
      const { app } = await seededApp(pool, NOW);
      const res = await request(app).get('/api/slots').query(query);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path })]),
      );
    });

    it('rejects a range longer than 31 days', async () => {
      const { app } = await seededApp(pool, NOW);
      const res = await request(app)
        .get('/api/slots')
        .query({ tz: 'Europe/London', from: '2026-11-12', to: '2026-12-31' });
      expect(res.status).toBe(422);
      expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });
});

describe('GET /api/health and unknown routes', () => {
  it('reports ok when the database answers', async () => {
    const { app } = await seededApp(pool, NOW);
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('reports 503 when the database does not', async () => {
    const app = createApp({
      slotService: undefined as never,
      checkDatabase: () => Promise.reject(new Error('down')),
    });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('unavailable');
  });

  it('404s unknown routes with the error envelope', async () => {
    const { app } = await seededApp(pool, NOW);
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'No route for GET /api/nope' },
    });
  });
});
