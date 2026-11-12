import { describe, expect, it } from 'vitest';
import { newUuid } from './uuid.js';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newUuid', () => {
  it('uses crypto.randomUUID when the page is a secure context', () => {
    const source = {
      randomUUID: () => '11111111-1111-4111-8111-111111111111',
      getRandomValues: <T extends ArrayBufferView | null>(a: T) => a,
    };
    expect(newUuid(source)).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('falls back to getRandomValues when randomUUID is missing (plain http, e.g. LAN IP)', () => {
    const source = { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) };
    const ids = new Set(Array.from({ length: 200 }, () => newUuid(source)));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(V4);
  });

  it('sets the version and variant bits even when every random byte is 0xff or 0x00', () => {
    const fill = (value: number) => ({
      getRandomValues: <T extends ArrayBufferView | null>(a: T) => {
        (a as unknown as Uint8Array).fill(value);
        return a;
      },
    });
    expect(newUuid(fill(0xff))).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(newUuid(fill(0x00))).toBe('00000000-0000-4000-8000-000000000000');
  });
});
