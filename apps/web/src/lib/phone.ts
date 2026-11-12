/** Country codes offered in the phone field. Our parents are mostly US/UK/CA/AU. */
export const DIAL_CODES = [
  { code: '+1', label: 'US / Canada (+1)' },
  { code: '+44', label: 'UK (+44)' },
  { code: '+353', label: 'Ireland (+353)' },
  { code: '+61', label: 'Australia (+61)' },
  { code: '+64', label: 'New Zealand (+64)' },
  { code: '+91', label: 'India (+91)' },
  { code: '+971', label: 'UAE (+971)' },
  { code: '+65', label: 'Singapore (+65)' },
] as const;

export type DialCode = (typeof DIAL_CODES)[number]['code'];

/** Countries whose local numbers start with a trunk "0" that is dropped internationally. */
const TRUNK_ZERO: ReadonlySet<string> = new Set(['+44', '+353', '+61', '+64']);

/** Best-guess country code from the parent's time zone. Defaults to +1. */
export function dialCodeForZone(zone: string): DialCode {
  if (zone === 'Europe/London') return '+44';
  if (zone === 'Europe/Dublin') return '+353';
  if (zone.startsWith('Australia/')) return '+61';
  if (zone === 'Pacific/Auckland') return '+64';
  if (zone === 'Asia/Kolkata' || zone === 'Asia/Calcutta') return '+91';
  if (zone === 'Asia/Dubai') return '+971';
  if (zone === 'Asia/Singapore') return '+65';
  return '+1';
}

export type PhoneResult = { ok: true; value: string | undefined } | { ok: false };

const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * Combines the picked country code and what the parent typed into E.164.
 * "07700 900123" with +44 → "+447700900123". A number typed with "+" or "00" is kept as typed.
 * Empty input is fine (phone is optional). Deliberately simple: no full numbering-plan check.
 */
export function toE164(dialCode: string, typed: string): PhoneResult {
  const raw = typed.trim();
  if (raw === '') return { ok: true, value: undefined };
  if (/[^\d\s().+-]/.test(raw)) return { ok: false };

  let candidate: string;
  if (raw.startsWith('+')) {
    candidate = `+${raw.slice(1).replace(/\D/g, '')}`;
  } else {
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('00')) {
      candidate = `+${digits.slice(2)}`;
    } else {
      if (TRUNK_ZERO.has(dialCode) && digits.startsWith('0')) digits = digits.slice(1);
      candidate = `${dialCode}${digits}`;
    }
  }
  return E164.test(candidate) ? { ok: true, value: candidate } : { ok: false };
}
