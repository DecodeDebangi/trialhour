import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const base = { DATABASE_URL: 'postgres://booking:booking@localhost:5432/booking' };

describe('loadConfig', () => {
  it('applies spec defaults (SPEC.md §10)', () => {
    expect(loadConfig(base)).toEqual({
      nodeEnv: 'development',
      databaseUrl: base.DATABASE_URL,
      port: 3001,
      minNoticeMinutes: 240,
      bookingHorizonDays: 14,
      mentorDailyCap: 2,
      assignmentStrategy: 'capacity-preserving',
      nowOverride: undefined,
    });
  });

  it('coerces numeric strings and accepts fair-load', () => {
    const config = loadConfig({
      ...base,
      PORT: '4000',
      MIN_NOTICE_MINUTES: '720',
      ASSIGNMENT_STRATEGY: 'fair-load',
    });
    expect(config.port).toBe(4000);
    expect(config.minNoticeMinutes).toBe(720);
    expect(config.assignmentStrategy).toBe('fair-load');
  });

  it('treats empty strings as unset', () => {
    expect(loadConfig({ ...base, NOW_OVERRIDE: '', PORT: '' }).port).toBe(3001);
  });

  it('requires DATABASE_URL', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it('rejects an unknown strategy', () => {
    expect(() => loadConfig({ ...base, ASSIGNMENT_STRATEGY: 'random' })).toThrow(
      /ASSIGNMENT_STRATEGY/,
    );
  });

  it('accepts NOW_OVERRIDE as an ISO instant outside production', () => {
    expect(loadConfig({ ...base, NOW_OVERRIDE: '2027-03-13T12:00:00Z' }).nowOverride).toBe(
      '2027-03-13T12:00:00Z',
    );
  });

  it('rejects NOW_OVERRIDE without an offset', () => {
    expect(() => loadConfig({ ...base, NOW_OVERRIDE: '2027-03-13T12:00:00' })).toThrow(
      /NOW_OVERRIDE/,
    );
  });

  it('refuses NOW_OVERRIDE in production', () => {
    expect(() =>
      loadConfig({ ...base, NODE_ENV: 'production', NOW_OVERRIDE: '2027-03-13T12:00:00Z' }),
    ).toThrow(/not allowed when NODE_ENV=production/);
  });
});
