import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { formatInstant, formatTime, localDayBounds, offsetLabel } from '@codeyoung/shared';
import {
  assertValidSchedule,
  generateMentorSlots,
  isOnSlotGrid,
  mentorSlotAt,
  slotsForWindow,
  validateSchedule,
  windowStartUtc,
} from './slots.js';
import { ScheduleValidationError } from './errors.js';
import type { MentorSchedule } from './types.js';
import { M1, M10, M4, M7, M9, SEED_SCHEDULES } from '../../test/fixtures/schedules.js';

const NY = 'America/New_York';
const LA = 'America/Los_Angeles';
const LONDON = 'Europe/London';
const SYDNEY = 'Australia/Sydney';
const INDIA = 'Asia/Kolkata';

const utc = (iso: string) => DateTime.fromISO(iso, { zone: 'utc' });
const starts = (slots: { startUtc: DateTime }[]) => slots.map((s) => s.startUtc.toISO());

/** A mentor's slots during one parent-local calendar day. */
function slotsOnLocalDay(schedule: MentorSchedule, date: string, zone: string) {
  return generateMentorSlots(schedule, localDayBounds(date, zone));
}

describe('windowStartUtc', () => {
  it('resolves India wall time to UTC', () => {
    const w = M1.windows[0]!;
    expect(windowStartUtc(w, '2027-03-27', INDIA).toISO()).toBe('2027-03-27T15:00:00.000Z');
  });
});

describe('slotsForWindow', () => {
  it('a shift crossing India midnight keeps the shift date of its start (SPEC A3)', () => {
    const saturday = M1.windows.find((w) => w.weekday === 6)!;
    const slots = slotsForWindow(M1, saturday, '2027-03-27');
    expect(starts(slots)).toEqual([
      '2027-03-27T15:00:00.000Z',
      '2027-03-27T16:00:00.000Z',
      '2027-03-27T17:00:00.000Z',
      '2027-03-27T18:00:00.000Z',
      '2027-03-27T19:00:00.000Z',
    ]);
    expect(slots.every((s) => s.shiftDate === '2027-03-27')).toBe(true);
    // The last slot is on the next India calendar day but still in Saturday's shift.
    expect(formatInstant(slots[4]!.startUtc, INDIA)).toBe(
      'Sun 28 Mar, 12:30 AM India time (GMT+5:30)',
    );
    expect(slots[4]!.endUtc.toISO()).toBe('2027-03-27T20:00:00.000Z');
  });
});

describe('generateMentorSlots', () => {
  it('returns slots with start in [from, to), sorted, including the previous shift spill-over', () => {
    // India midnight is 18:30Z; the 19:00Z slot belongs to the shift that started on the 26th.
    const slots = generateMentorSlots(M1, {
      startUtc: utc('2027-03-26T18:30:00Z'),
      endUtc: utc('2027-03-27T16:00:00Z'),
    });
    expect(starts(slots)).toEqual(['2027-03-26T19:00:00.000Z', '2027-03-27T15:00:00.000Z']);
    expect(slots.map((s) => s.shiftDate)).toEqual(['2027-03-26', '2027-03-27']);
  });

  it('end of range is exclusive', () => {
    const slots = generateMentorSlots(M1, {
      startUtc: utc('2027-03-27T15:00:00Z'),
      endUtc: utc('2027-03-27T16:00:00Z'),
    });
    expect(starts(slots)).toEqual(['2027-03-27T15:00:00.000Z']);
  });

  it('respects weekdays (M10: Australia on weekdays, UK mornings at weekends)', () => {
    // Fri 2 Apr 2027 and Sat 3 Apr 2027, India days.
    const fri = generateMentorSlots(M10, localDayBounds('2027-04-02', INDIA));
    const sat = generateMentorSlots(M10, localDayBounds('2027-04-03', INDIA));
    expect(formatTime(fri[0]!.startUtc, INDIA)).toBe('10:30 AM');
    expect(formatTime(sat[0]!.startUtc, INDIA)).toBe('1:30 PM');
    expect(fri).toHaveLength(4);
    expect(sat).toHaveLength(4);
  });

  it('a mentor in a DST zone keeps local hours, so UTC moves (model is not India-only)', () => {
    const london: MentorSchedule = {
      mentorId: 'L1',
      timezone: LONDON,
      windows: [6, 7].map((weekday) => ({
        id: `L1-${weekday}`,
        weekday: weekday as 6 | 7,
        startLocal: '16:00',
        durationMin: 120,
      })),
    };
    expect(starts(slotsOnLocalDay(london, '2027-03-27', LONDON))).toEqual([
      '2027-03-27T16:00:00.000Z',
      '2027-03-27T17:00:00.000Z',
    ]);
    expect(starts(slotsOnLocalDay(london, '2027-03-28', LONDON))).toEqual([
      '2027-03-28T15:00:00.000Z',
      '2027-03-28T16:00:00.000Z',
    ]);
  });

  it('documents Luxon DST resolution for mentor-local starts in a gap or overlap', () => {
    const w = { id: 'x', weekday: 7 as const, startLocal: '01:00', durationMin: 60 };
    // 01:00 does not exist in London on 28 Mar 2027 → moved forward to 02:00 BST (01:00Z).
    expect(windowStartUtc(w, '2027-03-28', LONDON).toISO()).toBe('2027-03-28T01:00:00.000Z');
    // 01:00 happens twice on 31 Oct 2027 → the later one, 01:00 GMT (01:00Z).
    expect(windowStartUtc(w, '2027-10-31', LONDON).toISO()).toBe('2027-10-31T01:00:00.000Z');
  });
});

describe('DST: parent-local days built from India-time shifts', () => {
  it('T1: US spring forward — New York slots move from 3 PM to 4 PM, same India shift', () => {
    const sat = slotsOnLocalDay(M4, '2027-03-13', NY);
    const sun = slotsOnLocalDay(M4, '2027-03-14', NY);
    expect(sat).toHaveLength(5);
    expect(sun).toHaveLength(5);

    expect(sat[0]!.startUtc.toISO()).toBe('2027-03-13T20:00:00.000Z');
    expect(formatTime(sat[0]!.startUtc, NY)).toBe('3:00 PM');
    expect(offsetLabel(sat[0]!.startUtc, NY)).toBe('GMT-5');

    expect(sun[0]!.startUtc.toISO()).toBe('2027-03-14T20:00:00.000Z');
    expect(formatTime(sun[0]!.startUtc, NY)).toBe('4:00 PM');
    expect(offsetLabel(sun[0]!.startUtc, NY)).toBe('GMT-4');

    // Same India shift start (01:30) on both days.
    expect(formatTime(sat[0]!.startUtc, INDIA)).toBe('1:30 AM');
    expect(formatTime(sun[0]!.startUtc, INDIA)).toBe('1:30 AM');
    expect([sat[0]!.shiftDate, sun[0]!.shiftDate]).toEqual(['2027-03-14', '2027-03-15']);
  });

  it('T2: New York 14 Mar 2027 is a 23h day; all slots fall inside it', () => {
    const bounds = localDayBounds('2027-03-14', NY);
    expect(bounds.startUtc.toISO()).toBe('2027-03-14T05:00:00.000Z');
    expect(bounds.endUtc.toISO()).toBe('2027-03-15T04:00:00.000Z');

    const all = SEED_SCHEDULES.flatMap((m) => generateMentorSlots(m, bounds)).sort(
      (a, b) => a.startUtc.toMillis() - b.startUtc.toMillis(),
    );
    expect(all.every((s) => s.startUtc >= bounds.startUtc && s.startUtc < bounds.endUtc)).toBe(
      true,
    );
    expect(all[0]!.startUtc.toISO()).toBe('2027-03-14T05:00:00.000Z');
    expect(all.at(-1)!.startUtc.toISO()).toBe('2027-03-15T03:00:00.000Z');
  });

  it('T5: UK spring forward — London slots move from 3 PM GMT to 4 PM BST', () => {
    const sat = slotsOnLocalDay(M1, '2027-03-27', LONDON);
    const sun = slotsOnLocalDay(M1, '2027-03-28', LONDON);
    expect(sat[0]!.startUtc.toISO()).toBe('2027-03-27T15:00:00.000Z');
    expect(formatInstant(sat[0]!.startUtc, LONDON)).toBe('Sat 27 Mar, 3:00 PM London time (GMT+0)');
    expect(sun[0]!.startUtc.toISO()).toBe('2027-03-28T15:00:00.000Z');
    expect(formatInstant(sun[0]!.startUtc, LONDON)).toBe('Sun 28 Mar, 4:00 PM London time (GMT+1)');
    expect(sat).toHaveLength(5);
    expect(sun).toHaveLength(5);
  });

  it('T6: UK fall back — London slots move from 4 PM BST to 3 PM GMT', () => {
    const sat = slotsOnLocalDay(M1, '2027-10-30', LONDON);
    const sun = slotsOnLocalDay(M1, '2027-10-31', LONDON);
    expect(sat[0]!.startUtc.toISO()).toBe('2027-10-30T15:00:00.000Z');
    expect(formatInstant(sat[0]!.startUtc, LONDON)).toBe('Sat 30 Oct, 4:00 PM London time (GMT+1)');
    expect(sun[0]!.startUtc.toISO()).toBe('2027-10-31T15:00:00.000Z');
    expect(formatInstant(sun[0]!.startUtc, LONDON)).toBe('Sun 31 Oct, 3:00 PM London time (GMT+0)');
  });

  it('T8: US fall back — New York and Los Angeles slots move an hour earlier', () => {
    const nySat = slotsOnLocalDay(M4, '2027-11-06', NY);
    const nySun = slotsOnLocalDay(M4, '2027-11-07', NY);
    expect(nySat[0]!.startUtc.toISO()).toBe('2027-11-06T20:00:00.000Z');
    expect(formatInstant(nySat[0]!.startUtc, NY)).toBe('Sat 6 Nov, 4:00 PM New York time (GMT-4)');
    expect(nySun[0]!.startUtc.toISO()).toBe('2027-11-07T20:00:00.000Z');
    expect(formatInstant(nySun[0]!.startUtc, NY)).toBe('Sun 7 Nov, 3:00 PM New York time (GMT-5)');

    const laSat = slotsOnLocalDay(M7, '2027-11-06', LA);
    const laSun = slotsOnLocalDay(M7, '2027-11-07', LA);
    expect(laSat[0]!.startUtc.toISO()).toBe('2027-11-06T23:00:00.000Z');
    expect(formatInstant(laSat[0]!.startUtc, LA)).toBe(
      'Sat 6 Nov, 4:00 PM Los Angeles time (GMT-7)',
    );
    expect(laSun[0]!.startUtc.toISO()).toBe('2027-11-07T23:00:00.000Z');
    expect(formatInstant(laSun[0]!.startUtc, LA)).toBe(
      'Sun 7 Nov, 3:00 PM Los Angeles time (GMT-8)',
    );
  });

  it('T9: New York 7 Nov 2027 is a 25h day; the slot at its exclusive end belongs to 8 Nov', () => {
    const bounds = localDayBounds('2027-11-07', NY);
    expect(bounds.startUtc.toISO()).toBe('2027-11-07T04:00:00.000Z');
    expect(bounds.endUtc.toISO()).toBe('2027-11-08T05:00:00.000Z');

    const all = SEED_SCHEDULES.flatMap((m) => generateMentorSlots(m, bounds));
    const startsSet = new Set(starts(all));
    expect(startsSet.has('2027-11-07T05:00:00.000Z')).toBe(true);
    expect(startsSet.has('2027-11-08T03:00:00.000Z')).toBe(true);
    // M9's 10:30 India slot on 8 Nov is 05:00Z = midnight in New York on 8 Nov: not on the 7th.
    expect(startsSet.has('2027-11-08T05:00:00.000Z')).toBe(false);
    expect(starts(generateMentorSlots(M9, localDayBounds('2027-11-08', NY)))).toContain(
      '2027-11-08T05:00:00.000Z',
    );
  });

  it('T11: Sydney DST ends — 4 PM AEDT becomes 3 PM AEST', () => {
    const sat = slotsOnLocalDay(M9, '2027-04-03', SYDNEY);
    const sun = slotsOnLocalDay(M9, '2027-04-04', SYDNEY);
    expect(sat[0]!.startUtc.toISO()).toBe('2027-04-03T05:00:00.000Z');
    expect(formatInstant(sat[0]!.startUtc, SYDNEY)).toBe('Sat 3 Apr, 4:00 PM Sydney time (GMT+11)');
    expect(sun[0]!.startUtc.toISO()).toBe('2027-04-04T05:00:00.000Z');
    expect(formatInstant(sun[0]!.startUtc, SYDNEY)).toBe('Sun 4 Apr, 3:00 PM Sydney time (GMT+10)');
  });

  it('T12: Sydney DST starts — 3 PM AEST becomes 4 PM AEDT', () => {
    const sat = slotsOnLocalDay(M9, '2027-10-02', SYDNEY);
    const sun = slotsOnLocalDay(M9, '2027-10-03', SYDNEY);
    expect(sat[0]!.startUtc.toISO()).toBe('2027-10-02T05:00:00.000Z');
    expect(formatInstant(sat[0]!.startUtc, SYDNEY)).toBe('Sat 2 Oct, 3:00 PM Sydney time (GMT+10)');
    expect(sun[0]!.startUtc.toISO()).toBe('2027-10-03T05:00:00.000Z');
    expect(formatInstant(sun[0]!.startUtc, SYDNEY)).toBe('Sun 3 Oct, 4:00 PM Sydney time (GMT+11)');
  });
});

describe('shift date across India midnight (the rule the daily cap depends on)', () => {
  it('00:30 India slot of the 20:30 UK-evening shift keeps the previous day; next 20:30 starts a new shift', () => {
    // Shift that starts Sat 27 Mar 2027, 20:30 India time.
    const at2330 = mentorSlotAt(M1, utc('2027-03-27T18:00:00Z'));
    const at0030 = mentorSlotAt(M1, utc('2027-03-27T19:00:00Z'));
    const nextEvening = mentorSlotAt(M1, utc('2027-03-28T15:00:00Z'));

    expect(formatInstant(at2330!.startUtc, INDIA)).toBe(
      'Sat 27 Mar, 11:30 PM India time (GMT+5:30)',
    );
    expect(formatInstant(at0030!.startUtc, INDIA)).toBe(
      'Sun 28 Mar, 12:30 AM India time (GMT+5:30)',
    );
    expect(formatInstant(nextEvening!.startUtc, INDIA)).toBe(
      'Sun 28 Mar, 8:30 PM India time (GMT+5:30)',
    );

    expect(at2330!.shiftDate).toBe('2027-03-27');
    expect(at0030!.shiftDate).toBe('2027-03-27'); // India calendar says 28 Mar; shift says 27 Mar
    expect(nextEvening!.shiftDate).toBe('2027-03-28');
    expect([at0030!.windowId, nextEvening!.windowId]).toEqual(['M1-w6', 'M1-w7']);
  });
});

describe('mentorSlotAt', () => {
  it('finds the slot and its shift date, including after India midnight', () => {
    const slot = mentorSlotAt(M1, utc('2027-03-27T19:00:00Z'));
    expect(slot?.shiftDate).toBe('2027-03-27');
    expect(slot?.windowId).toBe('M1-w6');
  });

  it('returns undefined off the grid or outside every window', () => {
    expect(mentorSlotAt(M1, utc('2027-03-27T15:30:00Z'))).toBeUndefined();
    expect(mentorSlotAt(M1, utc('2027-03-27T10:00:00Z'))).toBeUndefined();
  });
});

describe('isOnSlotGrid', () => {
  it('accepts :00 UTC only', () => {
    expect(isOnSlotGrid(utc('2027-03-27T15:00:00Z'))).toBe(true);
    expect(isOnSlotGrid(utc('2027-03-27T15:30:00Z'))).toBe(false);
    expect(isOnSlotGrid(utc('2027-03-27T15:00:01Z'))).toBe(false);
  });
});

describe('validateSchedule (C11)', () => {
  const opts = { fromDate: '2026-11-12', days: 366 };
  const india = (windows: MentorSchedule['windows']): MentorSchedule => ({
    mentorId: 'X',
    timezone: INDIA,
    windows,
  });

  it('C11: every seed schedule is valid for a full year, across all 2027 DST changes', () => {
    for (const schedule of SEED_SCHEDULES) {
      expect(validateSchedule(schedule, opts)).toEqual([]);
    }
  });

  it('C11: rejects a window off the UTC hour grid (20:00 India = 14:30 UTC)', () => {
    const issues = validateSchedule(
      india([{ id: 'a', weekday: 1, startLocal: '20:00', durationMin: 60 }]),
      opts,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/window a: .* starts at 14:30 UTC/);
  });

  it('C11: rejects overlapping windows on the same day', () => {
    const issues = validateSchedule(
      india([
        { id: 'a', weekday: 1, startLocal: '20:30', durationMin: 180 },
        { id: 'b', weekday: 1, startLocal: '21:30', durationMin: 60 },
      ]),
      opts,
    );
    expect(issues).toEqual([expect.stringMatching(/windows a and b overlap/)]);
  });

  it('C11: rejects a shift crossing midnight into the next day’s window', () => {
    const issues = validateSchedule(
      india([
        { id: 'mon', weekday: 1, startLocal: '20:30', durationMin: 300 },
        { id: 'tue', weekday: 2, startLocal: '00:30', durationMin: 60 },
      ]),
      opts,
    );
    expect(issues).toEqual([expect.stringMatching(/windows mon and tue overlap/)]);
  });

  it('C11: allows back-to-back windows', () => {
    expect(
      validateSchedule(
        india([
          { id: 'a', weekday: 1, startLocal: '20:30', durationMin: 120 },
          { id: 'b', weekday: 1, startLocal: '22:30', durationMin: 60 },
        ]),
        opts,
      ),
    ).toEqual([]);
  });

  it('C11: catches a zone whose DST moves a window off-grid for part of the year', () => {
    // Lord Howe Island shifts by 30 minutes: 10:00 local is 23:00Z in summer, 23:30Z in winter.
    const issues = validateSchedule(
      {
        mentorId: 'LH',
        timezone: 'Australia/Lord_Howe',
        windows: [{ id: 'lh', weekday: 3, startLocal: '10:00', durationMin: 60 }],
      },
      opts,
    );
    expect(issues).toEqual([expect.stringMatching(/window lh: .* starts at 23:30 UTC/)]);
  });

  it('C11: rejects malformed windows and zones', () => {
    expect(
      validateSchedule(
        india([
          { id: 'w', weekday: 8 as never, startLocal: '9:30', durationMin: 90 },
          { id: 'long', weekday: 1, startLocal: '20:30', durationMin: 25 * 60 },
        ]),
        opts,
      ),
    ).toEqual([
      expect.stringMatching(/window w: weekday must be 1–7/),
      expect.stringMatching(/window w: startLocal must be "HH:mm"/),
      expect.stringMatching(/window w: duration must be/),
      expect.stringMatching(/window long: duration must be/),
    ]);
    expect(validateSchedule({ ...M1, timezone: 'IST' }, opts)).toEqual([
      expect.stringMatching(/timezone "IST" is not a supported IANA zone/),
    ]);
  });

  it('assertValidSchedule throws ScheduleValidationError with the issues', () => {
    const bad = india([{ id: 'a', weekday: 1, startLocal: '20:00', durationMin: 60 }]);
    expect(() => assertValidSchedule(bad, opts)).toThrow(ScheduleValidationError);
    expect(() => assertValidSchedule(M1, opts)).not.toThrow();
  });
});
