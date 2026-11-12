import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { parseInstant } from './instant.js';

describe('parseInstant', () => {
  it('normalises offset strings to UTC', () => {
    expect(parseInstant('2027-03-14T02:30:00-05:00').toISO()).toBe('2027-03-14T07:30:00.000Z');
    expect(parseInstant('2027-03-14T21:00:00Z').zoneName).toBe('UTC');
  });

  it('normalises zoned DateTimes to UTC', () => {
    const local = DateTime.fromISO('2027-03-28T01:30', { zone: 'Europe/London' });
    expect(parseInstant(local).toISO()).toBe('2027-03-28T01:30:00.000Z');
  });

  it('rejects strings without Z or offset', () => {
    expect(() => parseInstant('2027-03-14T02:30:00')).toThrow(/explicit offset/);
  });

  it('rejects garbage and invalid DateTimes', () => {
    expect(() => parseInstant('not-a-date')).toThrow(/Invalid instant/);
    expect(() => parseInstant(DateTime.invalid('test'))).toThrow(/Invalid instant/);
  });
});
