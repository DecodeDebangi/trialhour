import { describe, expect, it } from 'vitest';
import { dialCodeForZone, toE164 } from './phone.js';

describe('dialCodeForZone', () => {
  it('defaults the country code from the time zone', () => {
    expect(dialCodeForZone('Europe/London')).toBe('+44');
    expect(dialCodeForZone('America/New_York')).toBe('+1');
    expect(dialCodeForZone('America/Toronto')).toBe('+1');
    expect(dialCodeForZone('Europe/Dublin')).toBe('+353');
    expect(dialCodeForZone('Australia/Sydney')).toBe('+61');
    expect(dialCodeForZone('Asia/Kolkata')).toBe('+91');
    expect(dialCodeForZone('Africa/Lagos')).toBe('+1');
  });
});

describe('toE164', () => {
  it('builds E.164 from a UK number typed the local way', () => {
    expect(toE164('+44', '07700 900123')).toEqual({ ok: true, value: '+447700900123' });
  });

  it('handles US formatting and Australian trunk zero', () => {
    expect(toE164('+1', '(212) 555-0142')).toEqual({ ok: true, value: '+12125550142' });
    expect(toE164('+61', '0412 345 678')).toEqual({ ok: true, value: '+61412345678' });
  });

  it('does not strip a leading 0 where there is no trunk prefix', () => {
    expect(toE164('+1', '0212 555 0142').ok).toBe(true);
  });

  it('keeps numbers already typed internationally, with + or 00', () => {
    expect(toE164('+1', '+44 7700 900123')).toEqual({ ok: true, value: '+447700900123' });
    expect(toE164('+1', '0044 7700 900123')).toEqual({ ok: true, value: '+447700900123' });
  });

  it('treats empty as "no phone" (optional field)', () => {
    expect(toE164('+44', '   ')).toEqual({ ok: true, value: undefined });
  });

  it('rejects letters and numbers that are too short or too long', () => {
    expect(toE164('+44', '0770 CALL ME')).toEqual({ ok: false });
    expect(toE164('+44', '123')).toEqual({ ok: false });
    expect(toE164('+1', '1234567890123456')).toEqual({ ok: false });
  });
});
