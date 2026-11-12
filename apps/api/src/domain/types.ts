import type { DateTime } from 'luxon';

/** ISO weekday, 1 = Monday … 7 = Sunday, in the mentor's zone, of the shift *start*. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface AvailabilityWindow {
  id: string;
  weekday: Weekday;
  /** "HH:mm" in the mentor's zone. */
  startLocal: string;
  durationMin: number;
}

export interface MentorSchedule {
  mentorId: string;
  /** IANA zone. */
  timezone: string;
  windows: readonly AvailabilityWindow[];
}

/** One bookable hour of one mentor. */
export interface MentorSlot {
  mentorId: string;
  windowId: string;
  startUtc: DateTime;
  endUtc: DateTime;
  /** "YYYY-MM-DD" in the mentor's zone: the date the window started on (SPEC A3). */
  shiftDate: string;
}

/** A confirmed booking, as far as availability is concerned. */
export interface BookedSlot {
  mentorId: string;
  startUtc: DateTime;
  shiftDate: string;
}

/** Business rules for when and how often a slot can be booked (SPEC A6, R4). */
export interface BookingPolicy {
  minNoticeMinutes: number;
  horizonDays: number;
  dailyCap: number;
}

/** Why a slot inside some mentor's window can't be booked. Precedence follows the list order. */
export type UnavailableReason = 'TOO_SOON' | 'DAILY_LIMIT_REACHED' | 'FULLY_BOOKED';
