import { describe, expect, it } from 'vitest';
import { dayStatus, defaultDate, nextOpenSlot, type Day } from './days.js';

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
    expect(days.map(dayStatus)).toEqual([
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
