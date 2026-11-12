import type { SlotDto, SlotsResponse } from '@codeyoung/shared';

export type Day = SlotsResponse['days'][number];

export type DayStatus =
  | { kind: 'open'; count: number }
  | { kind: 'full' } // has times, none bookable
  | { kind: 'closed' } // only times inside the notice period
  | { kind: 'none' }; // no mentor works that day

export function dayStatus(day: Day): DayStatus {
  if (day.slots.length === 0) return { kind: 'none' };
  const count = day.slots.filter((s) => s.available).length;
  if (count > 0) return { kind: 'open', count };
  return day.slots.every((s) => s.reason === 'TOO_SOON') ? { kind: 'closed' } : { kind: 'full' };
}

/** First bookable slot strictly after `afterUtc` (or overall when omitted). */
export function nextOpenSlot(days: readonly Day[], afterUtc?: string): SlotDto | null {
  for (const day of days) {
    for (const slot of day.slots) {
      if (slot.available && (!afterUtc || slot.startUtc > afterUtc)) return slot;
    }
  }
  return null;
}

/** The day to show first: the first with an open slot, else the first day. */
export function defaultDate(days: readonly Day[]): string | null {
  return days.find((d) => dayStatus(d).kind === 'open')?.date ?? days[0]?.date ?? null;
}
