import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { FixedClock, SystemClock, createClock } from './clock.js';

describe('FixedClock', () => {
  it('returns the given instant in UTC', () => {
    const clock = new FixedClock('2027-03-14T02:30:00-05:00');
    expect(clock.now().toISO()).toBe('2027-03-14T07:30:00.000Z');
    expect(clock.now().zoneName).toBe('UTC');
  });

  it('accepts a Luxon DateTime and normalises it to UTC', () => {
    const local = DateTime.fromISO('2027-03-28T01:30', { zone: 'Europe/London' });
    expect(new FixedClock(local).now().toISO()).toBe('2027-03-28T01:30:00.000Z');
  });

  it('rejects strings without Z or offset (ambiguous local time)', () => {
    expect(() => new FixedClock('2027-03-14T02:30:00')).toThrow(/explicit offset/);
  });

  it('rejects invalid instants', () => {
    expect(() => new FixedClock('not-a-date')).toThrow(/Invalid instant/);
  });

  it('can be set and advanced by elapsed time across a DST change', () => {
    const clock = new FixedClock('2027-03-14T06:00:00Z');
    clock.advance({ hours: 2 });
    expect(clock.now().toISO()).toBe('2027-03-14T08:00:00.000Z');
    clock.set('2027-11-07T05:30:00Z');
    expect(clock.now().toISO()).toBe('2027-11-07T05:30:00.000Z');
  });
});

describe('createClock', () => {
  it('uses a FixedClock when an override is given', () => {
    expect(createClock('2027-03-13T12:00:00Z').now().toISO()).toBe('2027-03-13T12:00:00.000Z');
  });

  it('uses the system clock otherwise', () => {
    const clock = createClock(undefined);
    expect(clock).toBeInstanceOf(SystemClock);
    expect(clock.now().zoneName).toBe('UTC');
  });
});
