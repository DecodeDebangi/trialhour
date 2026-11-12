import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { buildIcs } from './calendar.js';

const stamp = DateTime.fromISO('2027-03-10T09:15:00Z', { zone: 'utc' });
const event = {
  id: '6f1c2b1e-0000-4000-8000-000000000001',
  startUtc: '2027-03-14T21:00:00Z',
  endUtc: '2027-03-14T22:00:00Z',
  childName: 'Mason',
  mentorName: 'Arjun Sharma',
  classLink: 'https://class.example.com/trial/6f1c2b1e-0000-4000-8000-000000000001',
};

describe('buildIcs', () => {
  const ics = buildIcs(event, stamp);
  const unfolded = ics.replace(/\r\n /g, '');

  it('uses CRLF line endings throughout and ends with one', () => {
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('writes UTC instants, so calendar apps convert to the viewer’s zone (no VTIMEZONE)', () => {
    expect(unfolded).toContain('DTSTART:20270314T210000Z');
    expect(unfolded).toContain('DTEND:20270314T220000Z');
    expect(unfolded).toContain('DTSTAMP:20270310T091500Z');
    expect(unfolded).not.toContain('VTIMEZONE');
  });

  it('has a stable UID, summary, link and a 15-minute reminder', () => {
    expect(unfolded).toContain('UID:6f1c2b1e-0000-4000-8000-000000000001@trialhour.example.com');
    expect(unfolded).toContain('SUMMARY:Free coding class for Mason');
    expect(unfolded).toContain(`URL:${event.classLink}`);
    expect(unfolded).toContain('TRIGGER:-PT15M');
  });

  it('escapes commas, semicolons and newlines in text', () => {
    const tricky = buildIcs({ ...event, childName: 'Zoë, Jr; the 2nd' }, stamp).replace(
      /\r\n /g,
      '',
    );
    expect(tricky).toContain('SUMMARY:Free coding class for Zoë\\, Jr\; the 2nd');
    expect(unfolded).toMatch(/DESCRIPTION:1:1 trial class with Arjun Sharma\.\\nJoin here: /);
  });

  it('folds lines longer than 75 octets without splitting a character', () => {
    const encoder = new TextEncoder();
    const long = buildIcs({ ...event, mentorName: 'Ananya Iyer ✨'.repeat(8) }, stamp);
    for (const line of long.split('\r\n')) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(long.replace(/\r\n /g, '')).toContain('Ananya Iyer ✨Ananya Iyer ✨');
  });
});
