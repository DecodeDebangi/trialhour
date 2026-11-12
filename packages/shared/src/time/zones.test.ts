import { describe, expect, it } from 'vitest';
import { InvalidTimeZoneError, assertValidZone, isValidZone } from './zones.js';

describe('isValidZone', () => {
  it.each([
    'America/New_York',
    'America/Indiana/Indianapolis',
    'America/Phoenix',
    'Europe/London',
    'Europe/Dublin',
    'Asia/Kolkata',
    'Asia/Calcutta',
    'Australia/Sydney',
    'Australia/Brisbane',
    'Etc/UTC',
    'UTC',
  ])('accepts %s', (zone) => {
    expect(isValidZone(zone)).toBe(true);
  });

  it.each([
    ['EST', 'abbreviation ICU maps to America/Panama (no DST)'],
    ['IST', 'abbreviation ICU maps to India; Irish users would disagree'],
    ['EST5EDT', 'POSIX-style legacy zone'],
    ['GMT', 'abbreviation'],
    ['UTC+5', 'fixed offset'],
    ['+05:30', 'fixed offset'],
    ['america/new_york', 'non-canonical case'],
    ['Nope/Zone', 'unknown'],
    ['', 'empty'],
  ])('rejects %s (%s)', (zone) => {
    expect(isValidZone(zone)).toBe(false);
  });
});

describe('assertValidZone', () => {
  it('throws InvalidTimeZoneError carrying the zone', () => {
    expect(() => assertValidZone('EST')).toThrow(InvalidTimeZoneError);
    try {
      assertValidZone('EST');
    } catch (e) {
      expect((e as InvalidTimeZoneError).zone).toBe('EST');
    }
  });

  it('passes for valid zones', () => {
    expect(() => assertValidZone('Europe/London')).not.toThrow();
  });
});
