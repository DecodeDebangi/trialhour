import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { bookableRange, checkBookingWindow } from './bookingWindow.js';

const policy = { minNoticeMinutes: 240, horizonDays: 14, dailyCap: 2 };
const now = DateTime.fromISO('2027-03-20T12:00:00Z', { zone: 'utc' });

describe('bookableRange', () => {
  it('is [now + 4h, now + 14 days]', () => {
    const { earliest, latest } = bookableRange(now, policy);
    expect(earliest.toISO()).toBe('2027-03-20T16:00:00.000Z');
    expect(latest.toISO()).toBe('2027-04-03T12:00:00.000Z');
  });
});

describe('checkBookingWindow', () => {
  it('C7: 3h59m ahead is TOO_SOON, exactly 4h is OK', () => {
    expect(checkBookingWindow(now.plus({ hours: 3, minutes: 59 }), now, policy)).toBe('TOO_SOON');
    expect(checkBookingWindow(now.plus({ hours: 4 }), now, policy)).toBe('OK');
  });

  it('C7: exactly 14 days ahead is OK, later is BEYOND_HORIZON', () => {
    expect(checkBookingWindow(now.plus({ days: 14 }), now, policy)).toBe('OK');
    expect(checkBookingWindow(now.plus({ days: 14, minutes: 1 }), now, policy)).toBe(
      'BEYOND_HORIZON',
    );
  });

  it('now and earlier are IN_PAST', () => {
    expect(checkBookingWindow(now, now, policy)).toBe('IN_PAST');
    expect(checkBookingWindow(now.minus({ hours: 1 }), now, policy)).toBe('IN_PAST');
  });

  it('respects a configured notice (e.g. the cautious 12h)', () => {
    const cautious = { ...policy, minNoticeMinutes: 720 };
    expect(checkBookingWindow(now.plus({ hours: 11 }), now, cautious)).toBe('TOO_SOON');
    expect(checkBookingWindow(now.plus({ hours: 12 }), now, cautious)).toBe('OK');
  });
});
