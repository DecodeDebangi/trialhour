import { Info } from 'luxon';

export class InvalidTimeZoneError extends Error {
  constructor(readonly zone: string) {
    super(`Not a supported IANA time zone: "${zone}"`);
    this.name = 'InvalidTimeZoneError';
  }
}

// Area/Location form, e.g. America/New_York, America/Indiana/Indianapolis, Etc/GMT+5.
const IANA_AREA_LOCATION = /^[A-Z][A-Za-z_-]*(\/[A-Za-z0-9_+-]+)+$/;

/**
 * True for canonical-looking IANA names that the runtime knows. Deliberately rejects
 * abbreviations and legacy aliases that ICU accepts: "EST" silently resolves to
 * America/Panama (no DST) and "IST" to India, which is exactly the ambiguity we avoid.
 */
export function isValidZone(zone: string): boolean {
  if (zone === 'UTC') return true;
  return IANA_AREA_LOCATION.test(zone) && Info.isValidIANAZone(zone);
}

export function assertValidZone(zone: string): void {
  if (!isValidZone(zone)) throw new InvalidTimeZoneError(zone);
}
