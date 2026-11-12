import type { DateTime } from 'luxon';
import {
  localDateOf,
  localDayBounds,
  type SlotDto,
  type SlotsQuery,
  type SlotsResponse,
} from '@codeyoung/shared';
import type { Clock } from '../clock.js';
import { computeAvailability } from '../domain/availability.js';
import { RequestValidationError } from '../domain/errors.js';
import type { BookingPolicy } from '../domain/types.js';
import type { BookingRepository } from '../repositories/bookingRepo.js';
import type { MentorRepository } from '../repositories/mentorRepo.js';

/** Longest range one request may ask for. The UI asks for the 14-day horizon. */
export const MAX_RANGE_DAYS = 31;

export interface SlotServiceDeps {
  mentors: MentorRepository;
  bookings: BookingRepository;
  clock: Clock;
  policy: BookingPolicy;
}

const iso = (dt: DateTime) => dt.toUTC().toISO({ suppressMilliseconds: true }) as string;

export class SlotService {
  constructor(private readonly deps: SlotServiceDeps) {}

  /** Slots grouped by the parent's local calendar date; every date in range is listed. */
  async listSlots(query: SlotsQuery): Promise<SlotsResponse> {
    const { clock, policy, mentors, bookings } = this.deps;
    const tz = query.tz;
    const now = clock.now();
    const from = query.from ?? localDateOf(now, tz);
    const to = query.to ?? localDateOf(now.plus({ days: policy.horizonDays }), tz);

    const dates = datesBetween(from, to, tz);
    if (dates.length > MAX_RANGE_DAYS) {
      throw new RequestValidationError(`Date range may span at most ${MAX_RANGE_DAYS} days`, {
        from,
        to,
      });
    }

    const range = {
      startUtc: localDayBounds(from, tz).startUtc,
      endUtc: localDayBounds(to, tz).endUtc,
    };
    const schedules = (await mentors.listWithSchedules()).map((m) => m.schedule);
    // A shift lasts ≤ 24h, so ±24h catches every booking that counts toward a shift in range.
    const booked = await bookings.listBookedSlots({
      startUtc: range.startUtc.minus({ hours: 24 }),
      endUtc: range.endUtc.plus({ hours: 24 }),
    });

    const byDate = new Map<string, SlotDto[]>();
    for (const slot of computeAvailability(schedules, booked, range, now, policy)) {
      const date = localDateOf(slot.startUtc, tz);
      const dto: SlotDto = {
        startUtc: iso(slot.startUtc),
        endUtc: iso(slot.endUtc),
        available: slot.reason === null,
        ...(slot.reason ? { reason: slot.reason } : {}),
      };
      byDate.set(date, [...(byDate.get(date) ?? []), dto]);
    }

    return {
      timezone: tz,
      policy: {
        minNoticeMinutes: policy.minNoticeMinutes,
        horizonDays: policy.horizonDays,
        dailyCap: policy.dailyCap,
      },
      days: dates.map((date) => ({ date, slots: byDate.get(date) ?? [] })),
    };
  }
}

function datesBetween(from: string, to: string, tz: string): string[] {
  const dates: string[] = [];
  let day = localDayBounds(from, tz).startUtc.setZone(tz);
  const last = localDayBounds(to, tz).startUtc.setZone(tz);
  // Stop early once past the cap; the caller turns that into a validation error.
  while (day <= last && dates.length <= MAX_RANGE_DAYS) {
    dates.push(day.toISODate() as string);
    day = day.plus({ days: 1 });
  }
  return dates;
}
