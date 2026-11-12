import type { DateTime } from 'luxon';
import { parseInstant } from './instant.js';
import { assertValidZone } from './zones.js';

// Friendly names where the IANA city would mislead. Never abbreviations.
const ZONE_LABEL_OVERRIDES: Readonly<Record<string, string>> = {
  'Asia/Kolkata': 'India time',
  'Asia/Calcutta': 'India time',
  // Browsers can report any of these UTC aliases; all of them are plain UTC.
  UTC: 'UTC',
  'Etc/UTC': 'UTC',
  'Etc/UCT': 'UTC',
  'Etc/GMT': 'UTC',
  'Etc/GMT0': 'UTC',
  'Etc/GMT+0': 'UTC',
  'Etc/GMT-0': 'UTC',
  'Etc/Greenwich': 'UTC',
  'Etc/Universal': 'UTC',
  'Etc/Zulu': 'UTC',
};

/** "New York time", "India time", "Indianapolis time", "UTC". */
export function zoneLabel(zone: string): string {
  assertValidZone(zone);
  const override = ZONE_LABEL_OVERRIDES[zone];
  if (override) return override;
  // Etc/GMT+5 is POSIX-inverted (it means GMT-5); never show its name, only the computed offset.
  if (zone.startsWith('Etc/')) return 'Fixed-offset time';
  const city = zone.slice(zone.lastIndexOf('/') + 1).replaceAll('_', ' ');
  return `${city} time`;
}

/** UTC offset at that instant: "GMT-5", "GMT+5:30", "GMT+0". Never stored, always computed. */
export function offsetLabel(instant: DateTime | string, zone: string): string {
  assertValidZone(zone);
  const minutes = parseInstant(instant).setZone(zone).offset;
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  return `GMT${sign}${hours}${mins ? `:${String(mins).padStart(2, '0')}` : ''}`;
}

function localised(instant: DateTime | string, zone: string): DateTime {
  assertValidZone(zone);
  // en-US tokens give "Thu", "Nov", "PM" regardless of the runtime's default locale.
  return parseInstant(instant).setZone(zone).setLocale('en-US');
}

/** "Thu 12 Nov" in the given zone. */
export function formatDate(instant: DateTime | string, zone: string): string {
  return localised(instant, zone).toFormat('ccc d LLL');
}

/** "4:00 PM" in the given zone. Only for slot-grid buttons under a dated, zoned header (SPEC §7). */
export function formatTime(instant: DateTime | string, zone: string): string {
  return localised(instant, zone).toFormat('h:mm a');
}

/** "Thu 12 Nov, 4:00 PM New York time (GMT-5)". The format for every standalone time. */
export function formatInstant(instant: DateTime | string, zone: string): string {
  const when = `${formatDate(instant, zone)}, ${formatTime(instant, zone)}`;
  const label = zoneLabel(zone);
  // "UTC (GMT+0)" would just repeat itself.
  if (label === 'UTC') return `${when} UTC`;
  return `${when} ${label} (${offsetLabel(instant, zone)})`;
}
