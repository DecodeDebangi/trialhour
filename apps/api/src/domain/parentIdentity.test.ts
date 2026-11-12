import { describe, expect, it } from 'vitest';
import { normalizeIdentityPart } from './parentIdentity.js';

describe('normalizeIdentityPart', () => {
  it('trims, collapses whitespace and lower-cases', () => {
    expect(normalizeIdentityPart('  Aanya   Rao ')).toBe('aanya rao');
    expect(normalizeIdentityPart('Parent@Example.COM')).toBe('parent@example.com');
    expect(normalizeIdentityPart('Zoë\tSmith')).toBe('zoë smith');
  });
});
