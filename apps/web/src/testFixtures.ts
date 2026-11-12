import type { SlotDto, SlotsResponse, UnavailableReason } from '@codeyoung/shared';

export const NY = 'America/New_York';

export function slot(startUtc: string, reason?: UnavailableReason): SlotDto {
  const end = new Date(new Date(startUtc).getTime() + 3_600_000).toISOString().replace('.000', '');
  return reason
    ? { startUtc, endUtc: end, available: false, reason }
    : { startUtc, endUtc: end, available: true };
}

/** Thu 12 – Sat 14 Nov 2026 in New York: one too-soon day, one full day, one open day. */
export function slotsResponse(): SlotsResponse {
  return {
    timezone: NY,
    days: [
      {
        date: '2026-11-12',
        slots: [slot('2026-11-12T20:00:00Z', 'TOO_SOON'), slot('2026-11-12T21:00:00Z', 'TOO_SOON')],
      },
      {
        date: '2026-11-13',
        slots: [
          slot('2026-11-13T20:00:00Z', 'FULLY_BOOKED'),
          slot('2026-11-13T21:00:00Z', 'DAILY_LIMIT_REACHED'),
        ],
      },
      { date: '2026-11-14', slots: [] },
      {
        date: '2026-11-15',
        slots: [slot('2026-11-15T21:00:00Z'), slot('2026-11-15T22:00:00Z', 'FULLY_BOOKED')],
      },
    ],
  };
}
