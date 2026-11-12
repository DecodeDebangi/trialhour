import type { DateTime } from 'luxon';
import { assertValidZone } from '@codeyoung/shared';
import type { SlotAvailability } from './availability.js';

export const MAX_ALTERNATIVES = 5;

/**
 * Nearest bookable slots to a request the parent couldn't get (SPEC §8):
 * first the same *parent-local* day, closest in time first (earlier wins a tie),
 * then the following days in time order. Earlier days are not offered.
 */
export function nearestAlternatives(
  slots: readonly SlotAvailability[],
  requestedStart: DateTime,
  parentZone: string,
  limit = MAX_ALTERNATIVES,
): SlotAvailability[] {
  assertValidZone(parentZone); // once, not per slot: this runs on every 409
  const localDate = (dt: DateTime) => dt.setZone(parentZone).toISODate() as string;
  const requested = requestedStart.toMillis();
  const requestedDate = localDate(requestedStart);

  const sameDay: SlotAvailability[] = [];
  const laterDays: SlotAvailability[] = [];
  for (const slot of slots) {
    if (slot.reason !== null || slot.startUtc.toMillis() === requested) continue;
    const date = localDate(slot.startUtc);
    if (date === requestedDate) sameDay.push(slot);
    else if (date > requestedDate) laterDays.push(slot);
  }
  sameDay.sort((a, b) => {
    const da = Math.abs(a.startUtc.toMillis() - requested);
    const db = Math.abs(b.startUtc.toMillis() - requested);
    return da - db || a.startUtc.toMillis() - b.startUtc.toMillis();
  });
  laterDays.sort((a, b) => a.startUtc.toMillis() - b.startUtc.toMillis());

  return [...sameDay, ...laterDays].slice(0, limit);
}
