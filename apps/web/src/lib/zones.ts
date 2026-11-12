import { isValidZone, offsetLabel, zoneLabel } from '@codeyoung/shared';

/** Zones most of our parents use, shown first in the picker. */
export const COMMON_ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Vancouver',
  'Europe/London',
  'Europe/Dublin',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Australia/Adelaide',
  'Australia/Perth',
  'Asia/Kolkata',
] as const;

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The browser's zone, or null if it can't be detected or isn't a usable IANA name. */
export function detectZone(readZone: () => string | undefined = browserZone): string | null {
  try {
    const zone = readZone();
    return zone && isValidZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

/** Every IANA zone the browser knows that we accept, sorted, minus the common ones. */
export function otherZones(): string[] {
  const all =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  const common = new Set<string>(COMMON_ZONES);
  return all.filter((z) => isValidZone(z) && !common.has(z)).sort();
}

/** "New York time (GMT-5)" at the given instant. */
export function zoneOptionLabel(zone: string, at: Date): string {
  const label = zoneLabel(zone);
  return label === 'UTC' ? 'UTC' : `${label} (${offsetLabel(at.toISOString(), zone)})`;
}
