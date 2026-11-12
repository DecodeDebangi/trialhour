import { describe, expect, it } from 'vitest';
import { requestFingerprint } from './idempotency.js';

const base = {
  startUtc: '2026-11-13T21:00:00Z',
  parentTimezone: 'America/New_York',
  parentName: 'Ashley Johnson',
  parentEmail: 'ashley@example.com',
  childName: 'Mason',
  childGrade: 5,
};

describe('requestFingerprint', () => {
  it('is stable regardless of key order', () => {
    const reordered = {
      childGrade: 5,
      childName: 'Mason',
      parentEmail: 'ashley@example.com',
      parentName: 'Ashley Johnson',
      parentTimezone: 'America/New_York',
      startUtc: '2026-11-13T21:00:00Z',
    };
    expect(requestFingerprint(reordered)).toBe(requestFingerprint(base));
    expect(requestFingerprint(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when any field changes', () => {
    expect(requestFingerprint({ ...base, startUtc: '2026-11-13T22:00:00Z' })).not.toBe(
      requestFingerprint(base),
    );
    expect(requestFingerprint({ ...base, phone: '+12125550142' })).not.toBe(
      requestFingerprint(base),
    );
  });
});
