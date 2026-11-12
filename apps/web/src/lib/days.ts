import type { SlotDto, SlotsResponse } from '@codeyoung/shared';

export type Day = SlotsResponse['days'][number];

/** Which slots are on screen (daytime only by default; everything once the parent opts in). */
export type SlotFilter = (slot: SlotDto) => boolean;
export const SHOW_ALL: SlotFilter = () => true;

export type DayStatus =
  | { kind: 'open'; count: number } // open times the parent can currently see
  | { kind: 'nightOnly' } // open times exist, but only early morning / late night (hidden)
  | { kind: 'full' } // has times, none bookable
  | { kind: 'closed' } // only times inside the notice period
  | { kind: 'none' }; // no mentor works that day

export function dayStatus(day: Day, visible: SlotFilter = SHOW_ALL): DayStatus {
  if (day.slots.length === 0) return { kind: 'none' };
  const open = day.slots.filter((s) => s.available);
  const count = open.filter(visible).length;
  if (count > 0) return { kind: 'open', count };
  if (open.length > 0) return { kind: 'nightOnly' };
  return day.slots.every((s) => s.reason === 'TOO_SOON') ? { kind: 'closed' } : { kind: 'full' };
}

/** First bookable slot strictly after `afterUtc` (or overall when omitted) that passes `visible`. */
export function nextOpenSlot(
  days: readonly Day[],
  afterUtc?: string,
  visible: SlotFilter = SHOW_ALL,
): SlotDto | null {
  for (const day of days) {
    for (const slot of day.slots) {
      if (slot.available && visible(slot) && (!afterUtc || slot.startUtc > afterUtc)) return slot;
    }
  }
  return null;
}

/** The day to show first: the first with a visible open slot, else any open slot, else day one. */
export function defaultDate(days: readonly Day[], visible: SlotFilter = SHOW_ALL): string | null {
  return (
    days.find((d) => dayStatus(d, visible).kind === 'open')?.date ??
    days.find((d) => d.slots.some((s) => s.available))?.date ??
    days[0]?.date ??
    null
  );
}
