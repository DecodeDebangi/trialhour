import { describe, expect, it } from 'vitest';
import { dayStatus, defaultDate, nextOpenSlot, type Day, type SlotFilter } from './days.js';

const slot = (startUtc: string, available: boolean, reason?: 'TOO_SOON' | 'FULLY_BOOKED') => ({
  startUtc,
  endUtc: startUtc.replace(/T(\d\d)/, (_, h) => `T${String(Number(h) + 1).padStart(2, '0')}`),
  available,
  ...(reason ? { reason } : {}),
});

const days: Day[] = [
  { date: '2026-11-12', slots: [slot('2026-11-12T15:00:00Z', false, 'TOO_SOON')] },
  { date: '2026-11-13', slots: [slot('2026-11-13T15:00:00Z', false, 'FULLY_BOOKED')] },
  { date: '2026-11-14', slots: [] },
  {
    date: '2026-11-15',
    slots: [slot('2026-11-15T15:00:00Z', true), slot('2026-11-15T16:00:00Z', true)],
  },
];

describe('dayStatus', () => {
  it('says closed, full, none or how many are open', () => {
    expect(days.map((d) => dayStatus(d))).toEqual([
      { kind: 'closed' },
      { kind: 'full' },
      { kind: 'none' },
      { kind: 'open', count: 2 },
    ]);
  });
});

describe('nextOpenSlot / defaultDate', () => {
  it('finds the first open slot, optionally after a given start', () => {
    expect(nextOpenSlot(days)?.startUtc).toBe('2026-11-15T15:00:00Z');
    expect(nextOpenSlot(days, '2026-11-15T15:00:00Z')?.startUtc).toBe('2026-11-15T16:00:00Z');
    expect(nextOpenSlot(days, '2026-11-15T16:00:00Z')).toBeNull();
  });

  it('starts on the first day with an open slot', () => {
    expect(defaultDate(days)).toBe('2026-11-15');
    expect(defaultDate(days.slice(0, 2))).toBe('2026-11-12');
    expect(defaultDate([])).toBeNull();
  });
});

describe('with a daytime filter', () => {
  // Pretend only 3 PM starts are daytime, to test the filter mechanics in isolation.
  const daytime: SlotFilter = (s) => s.startUtc.endsWith('T15:00:00Z');
  const nightOnlyDay: Day = {
    date: '2026-11-16',
    slots: [slot('2026-11-16T02:00:00Z', true), slot('2026-11-16T03:00:00Z', true)],
  };

  it('a day with open times only at night says nightOnly, not "2 open"', () => {
    expect(dayStatus(nightOnlyDay, daytime)).toEqual({ kind: 'nightOnly' });
    expect(dayStatus(nightOnlyDay)).toEqual({ kind: 'open', count: 2 });
  });

  it('counts only visible open times', () => {
    expect(dayStatus(days[3]!, daytime)).toEqual({ kind: 'open', count: 1 });
  });

  it('default day and next open time skip hidden slots', () => {
    const withNight = [nightOnlyDay, ...days];
    expect(defaultDate(withNight, daytime)).toBe('2026-11-15');
    expect(defaultDate(withNight)).toBe('2026-11-16');
    expect(nextOpenSlot(withNight, undefined, daytime)?.startUtc).toBe('2026-11-15T15:00:00Z');
  });

  it('falls back to a day with any open slot when nothing visible is open', () => {
    expect(defaultDate([days[0]!, nightOnlyDay], daytime)).toBe('2026-11-16');
  });
});
