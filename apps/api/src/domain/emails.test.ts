import { describe, expect, it } from 'vitest';
import { composeBookingEmails } from './emails.js';

const input = {
  startUtc: '2027-03-14T21:00:00Z',
  parent: { name: 'Ashley Johnson', email: 'ashley@example.com', timezone: 'America/New_York' },
  child: { name: 'Mason', grade: 5 },
  mentor: { name: 'Arjun Sharma', email: 'arjun@mentors.example.com', timezone: 'Asia/Kolkata' },
  classLink: 'https://class.example.com/trial/abc',
};

describe('composeBookingEmails', () => {
  const [toParent, toMentor] = composeBookingEmails(input);

  it('X6: the parent email is in the parent’s own time (US already on DST here: GMT-4)', () => {
    expect(toParent.recipient).toBe('parent');
    expect(toParent.to).toBe('ashley@example.com');
    expect(toParent.subject).toBe(
      "Booked: Mason's free coding class, Sun 14 Mar, 5:00 PM New York time (GMT-4)",
    );
    expect(toParent.body).toContain('When: Sun 14 Mar, 5:00 PM New York time (GMT-4)');
    expect(toParent.body).toContain('Mentor: Arjun Sharma');
    expect(toParent.body).toContain('Class link: https://class.example.com/trial/abc');
    expect(toParent.body).toContain('laptop or desktop computer with a camera and microphone');
    expect(toParent.body.startsWith('Hi Ashley,')).toBe(true);
  });

  it('X6: the parent email never shows the mentor’s India time', () => {
    expect(toParent.body).not.toMatch(/India time|GMT\+5:30/);
  });

  it('X6: the mentor email is in India time, with the parent’s time as the second line (T16)', () => {
    expect(toMentor.recipient).toBe('mentor');
    expect(toMentor.to).toBe('arjun@mentors.example.com');
    expect(toMentor.subject).toBe('New trial class: Mon 15 Mar, 2:30 AM India time (GMT+5:30)');
    const lines = toMentor.body.split('\n');
    const when = lines.indexOf('When: Mon 15 Mar, 2:30 AM India time (GMT+5:30)');
    expect(when).toBeGreaterThan(0);
    expect(lines[when + 1]).toBe("Parent's time: Sun 14 Mar, 5:00 PM New York time (GMT-4)");
    expect(toMentor.body).toContain('Student: Mason, Grade 5');
    expect(toMentor.body).toContain('Parent: Ashley Johnson');
  });

  it('no time-zone abbreviations anywhere', () => {
    for (const m of [toParent, toMentor]) {
      expect(`${m.subject}\n${m.body}`).not.toMatch(/\b(IST|EST|EDT|BST|PST|PDT|CST)\b/);
    }
  });
});
