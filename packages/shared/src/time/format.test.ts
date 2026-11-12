import { describe, expect, it } from 'vitest';
import { DateTime, Settings } from 'luxon';
import { formatDate, formatInstant, formatTime, offsetLabel, zoneLabel } from './format.js';
import { InvalidTimeZoneError } from './zones.js';

const NY = 'America/New_York';
const LA = 'America/Los_Angeles';
const LONDON = 'Europe/London';
const INDIA = 'Asia/Kolkata';

describe('zoneLabel', () => {
  it('uses the city from the IANA id', () => {
    expect(zoneLabel(NY)).toBe('New York time');
    expect(zoneLabel('America/Indiana/Indianapolis')).toBe('Indianapolis time');
    expect(zoneLabel('America/Port_of_Spain')).toBe('Port of Spain time');
  });

  it('labels India and UTC by override', () => {
    expect(zoneLabel('Asia/Kolkata')).toBe('India time');
    expect(zoneLabel('Asia/Calcutta')).toBe('India time');
    expect(zoneLabel('UTC')).toBe('UTC');
    expect(zoneLabel('Etc/UTC')).toBe('UTC');
  });

  it('never shows the POSIX-inverted Etc/GMT name', () => {
    expect(zoneLabel('Etc/GMT+5')).toBe('Fixed-offset time');
  });

  it('rejects invalid zones', () => {
    expect(() => zoneLabel('EST')).toThrow(InvalidTimeZoneError);
  });
});

describe('offsetLabel', () => {
  it('formats whole, half and three-quarter hour offsets', () => {
    expect(offsetLabel('2027-01-15T12:00:00Z', NY)).toBe('GMT-5');
    expect(offsetLabel('2027-01-15T12:00:00Z', INDIA)).toBe('GMT+5:30');
    expect(offsetLabel('2027-01-15T12:00:00Z', LONDON)).toBe('GMT+0');
    expect(offsetLabel('2027-01-15T12:00:00Z', 'America/St_Johns')).toBe('GMT-3:30');
    expect(offsetLabel('2027-01-15T12:00:00Z', 'Asia/Kathmandu')).toBe('GMT+5:45');
  });

  it('computes the offset for the instant, not the zone in general', () => {
    expect(offsetLabel('2027-07-15T12:00:00Z', NY)).toBe('GMT-4');
    expect(offsetLabel('2027-07-15T12:00:00Z', LONDON)).toBe('GMT+1');
  });

  it('shows the real offset for Etc/GMT+5 (which means GMT-5)', () => {
    expect(offsetLabel('2027-01-15T12:00:00Z', 'Etc/GMT+5')).toBe('GMT-5');
  });
});

describe('formatDate / formatTime', () => {
  it('formats in the target zone', () => {
    expect(formatDate('2027-03-14T21:00:00Z', INDIA)).toBe('Mon 15 Mar');
    expect(formatTime('2027-03-14T21:00:00Z', INDIA)).toBe('2:30 AM');
  });

  it('accepts a Luxon DateTime', () => {
    const dt = DateTime.fromISO('2026-11-12T21:00:00Z');
    expect(formatDate(dt, NY)).toBe('Thu 12 Nov');
    expect(formatTime(dt, NY)).toBe('4:00 PM');
  });
});

describe('formatInstant', () => {
  it('matches the spec example format', () => {
    expect(formatInstant('2026-11-12T21:00:00Z', NY)).toBe(
      'Thu 12 Nov, 4:00 PM New York time (GMT-5)',
    );
  });

  it('does not repeat itself for UTC', () => {
    expect(formatInstant('2026-11-12T21:00:00Z', 'UTC')).toBe('Thu 12 Nov, 9:00 PM UTC');
  });

  it('T3: never shows a non-existent local time in the US spring-forward gap', () => {
    expect(formatInstant('2027-03-14T06:59:00Z', NY)).toBe(
      'Sun 14 Mar, 1:59 AM New York time (GMT-5)',
    );
    expect(formatInstant('2027-03-14T07:00:00Z', NY)).toBe(
      'Sun 14 Mar, 3:00 AM New York time (GMT-4)',
    );
  });

  it('T4: US on DST, UK not yet — London and New York 4h apart (20 Mar 2027)', () => {
    expect(formatInstant('2027-03-20T20:00:00Z', LONDON)).toBe(
      'Sat 20 Mar, 8:00 PM London time (GMT+0)',
    );
    expect(formatInstant('2027-03-20T20:00:00Z', NY)).toBe(
      'Sat 20 Mar, 4:00 PM New York time (GMT-4)',
    );
  });

  it('T7: UK back on GMT, US not yet — 4h apart (3 Nov 2027)', () => {
    expect(formatInstant('2027-11-03T20:00:00Z', LONDON)).toBe(
      'Wed 3 Nov, 8:00 PM London time (GMT+0)',
    );
    expect(formatInstant('2027-11-03T20:00:00Z', NY)).toBe(
      'Wed 3 Nov, 4:00 PM New York time (GMT-4)',
    );
  });

  it('T10: the repeated 1:30 AM on US fall-back is told apart by offset', () => {
    expect(formatInstant('2027-11-07T05:30:00Z', NY)).toBe(
      'Sun 7 Nov, 1:30 AM New York time (GMT-4)',
    );
    expect(formatInstant('2027-11-07T06:30:00Z', NY)).toBe(
      'Sun 7 Nov, 1:30 AM New York time (GMT-5)',
    );
  });

  it('T13: Brisbane (no DST) vs Sydney (DST) on 20 Nov 2026', () => {
    expect(formatInstant('2026-11-20T05:00:00Z', 'Australia/Brisbane')).toBe(
      'Fri 20 Nov, 3:00 PM Brisbane time (GMT+10)',
    );
    expect(formatInstant('2026-11-20T05:00:00Z', 'Australia/Sydney')).toBe(
      'Fri 20 Nov, 4:00 PM Sydney time (GMT+11)',
    );
  });

  it('T14: Arizona stays GMT-7 while Los Angeles changes', () => {
    expect(formatInstant('2027-01-16T23:00:00Z', 'America/Phoenix')).toBe(
      'Sat 16 Jan, 4:00 PM Phoenix time (GMT-7)',
    );
    expect(formatInstant('2027-01-16T23:00:00Z', LA)).toBe(
      'Sat 16 Jan, 3:00 PM Los Angeles time (GMT-8)',
    );
    expect(formatInstant('2027-03-20T23:00:00Z', 'America/Phoenix')).toBe(
      'Sat 20 Mar, 4:00 PM Phoenix time (GMT-7)',
    );
    expect(formatInstant('2027-03-20T23:00:00Z', LA)).toBe(
      'Sat 20 Mar, 4:00 PM Los Angeles time (GMT-7)',
    );
  });

  it('T15: labels for India, Dublin in summer, Indianapolis, UTC', () => {
    expect(formatInstant('2027-01-15T12:00:00Z', INDIA)).toBe(
      'Fri 15 Jan, 5:30 PM India time (GMT+5:30)',
    );
    expect(formatInstant('2027-01-15T12:00:00Z', 'Asia/Calcutta')).toBe(
      'Fri 15 Jan, 5:30 PM India time (GMT+5:30)',
    );
    expect(formatInstant('2027-07-01T15:00:00Z', 'Europe/Dublin')).toBe(
      'Thu 1 Jul, 4:00 PM Dublin time (GMT+1)',
    );
    expect(formatInstant('2027-07-01T15:00:00Z', 'America/Indiana/Indianapolis')).toBe(
      'Thu 1 Jul, 11:00 AM Indianapolis time (GMT-4)',
    );
    expect(formatInstant('2027-07-01T15:00:00Z', 'Etc/UTC')).toBe('Thu 1 Jul, 3:00 PM UTC');
  });

  it('T15: output never contains a time-zone abbreviation', () => {
    const zones = [
      NY,
      LA,
      LONDON,
      INDIA,
      'Asia/Calcutta',
      'Europe/Dublin',
      'America/Chicago',
      'America/Denver',
      'America/Phoenix',
      'America/Indiana/Indianapolis',
      'America/Toronto',
      'Australia/Sydney',
      'Australia/Brisbane',
      'Australia/Adelaide',
      'UTC',
    ];
    const instants = ['2027-01-15T12:00:00Z', '2027-07-15T12:00:00Z', '2027-11-07T06:30:00Z'];
    const abbreviation =
      /\b(IST|BST|GMT(?![+-])|EST|EDT|CST|CDT|MST|MDT|PST|PDT|AEST|AEDT|ACST|ACDT|IDT)\b/;
    for (const zone of zones) {
      for (const instant of instants) {
        expect(formatInstant(instant, zone)).not.toMatch(abbreviation);
      }
    }
  });

  it('T16: one booking, mentor sees India time and parent sees New York time', () => {
    const start = '2027-03-14T21:00:00Z';
    expect(formatInstant(start, INDIA)).toBe('Mon 15 Mar, 2:30 AM India time (GMT+5:30)');
    expect(formatInstant(start, NY)).toBe('Sun 14 Mar, 5:00 PM New York time (GMT-4)');
  });

  it('is independent of the runtime default locale', () => {
    const original = Settings.defaultLocale;
    try {
      // In en-GB, Luxon's "a" token renders "pm"; formatting must still say "PM".
      Settings.defaultLocale = 'en-GB';
      expect(formatInstant('2026-11-12T21:00:00Z', NY)).toBe(
        'Thu 12 Nov, 4:00 PM New York time (GMT-5)',
      );
    } finally {
      Settings.defaultLocale = original;
    }
  });
});
