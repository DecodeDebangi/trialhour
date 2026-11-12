import { describe, expect, it } from 'vitest';
import { localDateOf, localDayBounds } from './days.js';

const NY = 'America/New_York';

function iso(range: ReturnType<typeof localDayBounds>) {
  return [range.startUtc.toISO(), range.endUtc.toISO()];
}

function hours(range: ReturnType<typeof localDayBounds>) {
  return range.endUtc.diff(range.startUtc, 'hours').hours;
}

describe('localDayBounds', () => {
  it('a normal day is 24h', () => {
    const day = localDayBounds('2026-11-12', NY);
    expect(iso(day)).toEqual(['2026-11-12T05:00:00.000Z', '2026-11-13T05:00:00.000Z']);
    expect(hours(day)).toBe(24);
  });

  it('T2: US spring-forward day in New York is 23h', () => {
    const day = localDayBounds('2027-03-14', NY);
    expect(iso(day)).toEqual(['2027-03-14T05:00:00.000Z', '2027-03-15T04:00:00.000Z']);
    expect(hours(day)).toBe(23);
  });

  it('T9: US fall-back day in New York is 25h', () => {
    const day = localDayBounds('2027-11-07', NY);
    expect(iso(day)).toEqual(['2027-11-07T04:00:00.000Z', '2027-11-08T05:00:00.000Z']);
    expect(hours(day)).toBe(25);
  });

  it('UK and Sydney transition days', () => {
    expect(hours(localDayBounds('2027-03-28', 'Europe/London'))).toBe(23);
    expect(hours(localDayBounds('2027-10-31', 'Europe/London'))).toBe(25);
    expect(hours(localDayBounds('2027-04-04', 'Australia/Sydney'))).toBe(25);
    expect(hours(localDayBounds('2027-10-03', 'Australia/Sydney'))).toBe(23);
  });

  it('India never changes', () => {
    expect(iso(localDayBounds('2027-03-14', 'Asia/Kolkata'))).toEqual([
      '2027-03-13T18:30:00.000Z',
      '2027-03-14T18:30:00.000Z',
    ]);
  });

  it('rejects malformed dates and invalid zones', () => {
    expect(() => localDayBounds('2027-3-14', NY)).toThrow(/YYYY-MM-DD/);
    expect(() => localDayBounds('2027-02-30', NY)).toThrow(/YYYY-MM-DD/);
    expect(() => localDayBounds('2027-03-14', 'EST')).toThrow(/time zone/);
  });
});

describe('localDateOf', () => {
  it('returns the local calendar date of an instant', () => {
    expect(localDateOf('2027-03-14T21:00:00Z', NY)).toBe('2027-03-14');
    expect(localDateOf('2027-03-14T21:00:00Z', 'Asia/Kolkata')).toBe('2027-03-15');
  });

  it('is consistent with localDayBounds at the edges', () => {
    expect(localDateOf('2027-11-08T04:59:59Z', NY)).toBe('2027-11-07');
    expect(localDateOf('2027-11-08T05:00:00Z', NY)).toBe('2027-11-08');
  });
});
