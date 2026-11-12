import { describe, expect, it } from 'vitest';
import { COMMON_ZONES, detectZone, otherZones, zoneOptionLabel } from './zones.js';

describe('detectZone', () => {
  it('returns the browser zone when it is a valid IANA name', () => {
    expect(detectZone(() => 'America/New_York')).toBe('America/New_York');
  });

  it('accepts Etc/UTC (some browsers report it)', () => {
    expect(detectZone(() => 'Etc/UTC')).toBe('Etc/UTC');
  });

  it('returns null for unusable values like Etc/Unknown or abbreviations', () => {
    expect(detectZone(() => 'Etc/Unknown')).toBeNull();
    expect(detectZone(() => 'EST')).toBeNull();
    expect(detectZone(() => undefined)).toBeNull();
    expect(
      detectZone(() => {
        throw new Error('no Intl');
      }),
    ).toBeNull();
  });
});

describe('zone lists and labels', () => {
  it('otherZones excludes the common ones and anything invalid', () => {
    const others = otherZones();
    for (const z of COMMON_ZONES) expect(others).not.toContain(z);
    expect(others).not.toContain('EST');
  });

  it('labels with the offset at the given instant', () => {
    const jan = new Date('2027-01-15T12:00:00Z');
    const jul = new Date('2027-07-15T12:00:00Z');
    expect(zoneOptionLabel('America/New_York', jan)).toBe('New York time (GMT-5)');
    expect(zoneOptionLabel('America/New_York', jul)).toBe('New York time (GMT-4)');
    expect(zoneOptionLabel('Asia/Kolkata', jan)).toBe('India time (GMT+5:30)');
    expect(zoneOptionLabel('Etc/UTC', jan)).toBe('UTC');
  });
});
