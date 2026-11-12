import { describe, expect, it } from 'vitest';
import { DAYTIME_END_HOUR, DAYTIME_START_HOUR, isDaytime } from './daytime.js';

const LONDON = 'Europe/London';

describe('isDaytime', () => {
  it('is 7:00 AM to 9:00 PM: the whole class must fit', () => {
    expect([DAYTIME_START_HOUR, DAYTIME_END_HOUR]).toEqual([7, 21]);
    // Thu 12 Nov 2026, London is GMT+0, so UTC hours read as local hours.
    expect(isDaytime('2026-11-12T06:00:00Z', LONDON)).toBe(false); // 6:00 AM
    expect(isDaytime('2026-11-12T07:00:00Z', LONDON)).toBe(true); // 7:00 AM, first start
    expect(isDaytime('2026-11-12T20:00:00Z', LONDON)).toBe(true); // 8:00 PM, ends at 9:00 PM
    expect(isDaytime('2026-11-12T21:00:00Z', LONDON)).toBe(false); // 9:00 PM, ends at 10:00 PM
    expect(isDaytime('2026-11-13T02:00:00Z', LONDON)).toBe(false); // 2:00 AM
  });

  it('uses the parent’s zone, so the same instant can be night in London and evening in New York', () => {
    expect(isDaytime('2026-11-13T01:00:00Z', LONDON)).toBe(false); // 1:00 AM London
    expect(isDaytime('2026-11-13T01:00:00Z', 'America/New_York')).toBe(true); // 8:00 PM NY
  });

  it('follows DST: the same UTC hour is 6 AM in winter and 7 AM in summer in London', () => {
    expect(isDaytime('2027-03-27T06:00:00Z', LONDON)).toBe(false); // 6:00 AM GMT
    expect(isDaytime('2027-03-28T06:00:00Z', LONDON)).toBe(true); // 7:00 AM BST
  });

  it('works for half-hour zones (Adelaide sees :30 starts)', () => {
    expect(isDaytime('2026-11-12T20:30:00Z', 'Australia/Adelaide')).toBe(true); // 7:00 AM ACDT
    expect(isDaytime('2026-11-12T10:00:00Z', 'Australia/Adelaide')).toBe(false); // 8:30 PM → ends 9:30 PM
  });

  it('respects a different class length', () => {
    expect(isDaytime('2026-11-12T20:00:00Z', LONDON, 90)).toBe(false); // 8:00 PM + 90 min
  });

  it('is false for an unknown zone rather than throwing', () => {
    expect(isDaytime('2026-11-12T12:00:00Z', 'Nope/Zone')).toBe(false);
  });
});
