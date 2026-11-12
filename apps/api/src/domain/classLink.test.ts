import { describe, expect, it } from 'vitest';
import { classLinkFor } from './classLink.js';

describe('classLinkFor', () => {
  it('builds a link on the reserved example.com domain', () => {
    expect(classLinkFor('6f1c2b1e-0000-4000-8000-000000000001')).toBe(
      'https://class.example.com/trial/6f1c2b1e-0000-4000-8000-000000000001',
    );
  });
});
