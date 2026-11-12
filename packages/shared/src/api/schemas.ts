import { z } from 'zod';
import { isValidZone } from '../time/zones.js';

/** Why a shown slot is greyed out. Order = precedence (SPEC §8). */
export const UNAVAILABLE_REASONS = ['TOO_SOON', 'DAILY_LIMIT_REACHED', 'FULLY_BOOKED'] as const;
export const unavailableReasonSchema = z.enum(UNAVAILABLE_REASONS);
export type UnavailableReason = z.infer<typeof unavailableReasonSchema>;

export const ianaZoneSchema = z
  .string()
  .refine(isValidZone, { message: 'Must be an IANA time zone such as America/New_York' });

export const isoDateSchema = z.iso.date();

export const slotsQuerySchema = z
  .object({
    tz: ianaZoneSchema,
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: '`from` must not be after `to`',
    path: ['from'],
  });
export type SlotsQuery = z.infer<typeof slotsQuerySchema>;

export const slotSchema = z.object({
  startUtc: z.iso.datetime(),
  endUtc: z.iso.datetime(),
  available: z.boolean(),
  reason: unavailableReasonSchema.optional(),
});
export type SlotDto = z.infer<typeof slotSchema>;

export const slotsResponseSchema = z.object({
  timezone: z.string(),
  days: z.array(z.object({ date: isoDateSchema, slots: z.array(slotSchema) })),
});
export type SlotsResponse = z.infer<typeof slotsResponseSchema>;

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
