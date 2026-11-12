import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { nearestAlternatives } from './alternatives.js';
import type { SlotAvailability } from './availability.js';
import type { UnavailableReason } from './types.js';

const NY = 'America/New_York';
const utc = (iso: string) => DateTime.fromISO(iso, { zone: 'utc' });

function slot(iso: string, reason: UnavailableReason | null = null): SlotAvailability {
  const startUtc = utc(iso);
  return { startUtc, endUtc: startUtc.plus({ hours: 1 }), candidates: [], eligible: [], reason };
}
const starts = (slots: SlotAvailability[]) => slots.map((s) => s.startUtc.toISO());

describe('nearestAlternatives (C10)', () => {
  // New York, Fri 13 Nov 2026 (EST, UTC-5). Request: 5:00 PM = 22:00Z.
  const request = utc('2026-11-13T22:00:00Z');
  const slots = [
    slot('2026-11-12T22:00:00Z'), // Thu, an earlier day: never offered
    slot('2026-11-13T19:00:00Z'), // Fri 2 PM (-3h)
    slot('2026-11-13T21:00:00Z'), // Fri 4 PM (-1h)
    slot('2026-11-13T22:00:00Z', 'FULLY_BOOKED'), // the requested slot itself
    slot('2026-11-13T23:00:00Z'), // Fri 6 PM (+1h): ties with 4 PM, earlier wins
    slot('2026-11-14T01:00:00Z', 'DAILY_LIMIT_REACHED'), // Fri 8 PM, unavailable
    slot('2026-11-14T02:00:00Z'), // Fri 9 PM (+4h): late-night (ends 10 PM), so only after daytime
    slot('2026-11-14T20:00:00Z'), // Sat 3 PM
    slot('2026-11-15T20:00:00Z'), // Sun 3 PM
    slot('2026-11-16T20:00:00Z'), // Mon 3 PM
  ];

  it('same parent-local day by closeness first (earlier on a tie), then following days, daytime first', () => {
    expect(starts(nearestAlternatives(slots, request, NY))).toEqual([
      '2026-11-13T21:00:00.000Z', // Fri 4 PM
      '2026-11-13T23:00:00.000Z', // Fri 6 PM
      '2026-11-13T19:00:00.000Z', // Fri 2 PM
      '2026-11-14T20:00:00.000Z', // Sat 3 PM
      '2026-11-15T20:00:00.000Z', // Sun 3 PM (Fri 9 PM is late-night, so it's left out)
    ]);
  });

  it('daytime first; early-morning and late-night times only fill the remaining places', () => {
    const fewDaytime = [
      slot('2026-11-13T11:00:00Z'), // Fri 6 AM: early morning
      slot('2026-11-13T21:00:00Z'), // Fri 4 PM
      slot('2026-11-14T02:00:00Z'), // Fri 9 PM: late night
      slot('2026-11-14T05:00:00Z'), // Sat 12 AM: night
    ];
    expect(starts(nearestAlternatives(fewDaytime, request, NY))).toEqual([
      '2026-11-13T21:00:00.000Z',
      '2026-11-14T02:00:00.000Z',
      '2026-11-13T11:00:00.000Z',
      '2026-11-14T05:00:00.000Z',
    ]);
  });

  it('a parent who chose a night time gets plain nearest-first order, no daytime preference', () => {
    const nightRequest = utc('2026-11-14T03:00:00Z'); // Fri 10 PM New York
    expect(starts(nearestAlternatives(slots, nightRequest, NY, 3))).toEqual([
      '2026-11-14T02:00:00.000Z', // Fri 9 PM, 1h away
      '2026-11-13T23:00:00.000Z', // Fri 6 PM, 4h away
      '2026-11-13T21:00:00.000Z',
    ]);
  });

  it('never includes the requested slot, unavailable slots or earlier days', () => {
    const result = starts(nearestAlternatives(slots, request, NY, 20));
    expect(result).not.toContain('2026-11-13T22:00:00.000Z');
    expect(result).not.toContain('2026-11-14T01:00:00.000Z');
    expect(result).not.toContain('2026-11-12T22:00:00.000Z');
    expect(result).toHaveLength(7);
  });

  it('uses the parent’s local day, not the UTC day (01:00Z is still Friday 8 PM in New York)', () => {
    const around = [slot('2026-11-14T20:00:00Z'), slot('2026-11-14T01:00:00Z')];
    expect(starts(nearestAlternatives(around, request, NY))).toEqual([
      '2026-11-14T01:00:00.000Z', // Fri 8 PM: same local day as the request, so first
      '2026-11-14T20:00:00.000Z', // Sat 3 PM
    ]);
  });

  it('respects a 25h local day on US fall-back (Sun 7 Nov 2027)', () => {
    const req = utc('2027-11-07T20:00:00Z'); // 3 PM EST
    const around = [
      slot('2027-11-08T04:00:00Z'), // 11:00 PM Sun 7 Nov: same local day, though 8 Nov in UTC
      slot('2027-11-08T05:00:00Z'), // midnight → Mon 8 Nov
      slot('2027-11-07T04:00:00Z'), // 12:00 AM EDT, start of the 25h day
    ];
    expect(starts(nearestAlternatives(around, req, NY))).toEqual([
      '2027-11-08T04:00:00.000Z',
      '2027-11-07T04:00:00.000Z',
      '2027-11-08T05:00:00.000Z',
    ]);
  });

  it('returns at most 5 by default, and nothing when nothing is open', () => {
    expect(nearestAlternatives(slots, request, NY)).toHaveLength(5);
    expect(nearestAlternatives([slot('2026-11-13T21:00:00Z', 'TOO_SOON')], request, NY)).toEqual(
      [],
    );
  });
});
