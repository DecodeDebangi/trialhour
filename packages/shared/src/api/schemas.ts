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

const trimmed = (max: number) => z.string().trim().min(1, 'Required').max(max);

export const bookingRequestSchema = z.object({
  startUtc: z.iso.datetime({ offset: true }),
  parentTimezone: ianaZoneSchema,
  parentName: trimmed(100),
  parentEmail: z
    .string()
    .trim()
    .pipe(z.email({ message: 'Enter a valid email address' })),
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{6,14}$/, 'Use international format, e.g. +447700900123')
    .optional(),
  childName: trimmed(60),
  childGrade: z.number().int().min(1).max(12),
});
export type BookingRequest = z.infer<typeof bookingRequestSchema>;

export const bookingResponseSchema = z.object({
  id: z.uuid(),
  startUtc: z.iso.datetime(),
  endUtc: z.iso.datetime(),
  parentTimezone: z.string(),
  parent: z.object({ name: z.string(), email: z.string() }),
  child: z.object({ name: z.string(), grade: z.number() }),
  mentor: z.object({ id: z.uuid(), name: z.string(), timezone: z.string() }),
  classLink: z.url(),
  /** Relative URL of the booking's calendar file. */
  icsUrl: z.string().startsWith('/api/bookings/'),
});
export type BookingResponse = z.infer<typeof bookingResponseSchema>;

/** 409 body: the error envelope plus alternatives (empty until P1). */
export const slotUnavailableResponseSchema = errorResponseSchema.extend({
  alternatives: z.array(z.object({ startUtc: z.iso.datetime(), endUtc: z.iso.datetime() })),
});
export type SlotUnavailableResponse = z.infer<typeof slotUnavailableResponseSchema>;

/** 409 DUPLICATE_TRIAL body: the error envelope plus the child's existing upcoming trial. */
export const duplicateTrialResponseSchema = errorResponseSchema.extend({
  existingBooking: z.object({
    id: z.uuid(),
    startUtc: z.iso.datetime(),
    endUtc: z.iso.datetime(),
    childName: z.string(),
  }),
});
export type DuplicateTrialResponse = z.infer<typeof duplicateTrialResponseSchema>;

export const outboxQuerySchema = z.object({
  bookingId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type OutboxQuery = z.infer<typeof outboxQuerySchema>;

export const outboxMessageSchema = z.object({
  to: z.string(),
  subject: z.string(),
  body: z.string(),
});
export type OutboxMessageDto = z.infer<typeof outboxMessageSchema>;

/** One booking's two emails, side by side: the parent's and the mentor's. */
export const outboxEntrySchema = z.object({
  bookingId: z.uuid(),
  startUtc: z.iso.datetime(),
  childName: z.string(),
  mentorName: z.string(),
  parentTimezone: z.string(),
  mentorTimezone: z.string(),
  sentAt: z.iso.datetime(),
  parent: outboxMessageSchema,
  mentor: outboxMessageSchema,
});
export type OutboxEntry = z.infer<typeof outboxEntrySchema>;

export const outboxResponseSchema = z.object({ entries: z.array(outboxEntrySchema) });
export type OutboxResponse = z.infer<typeof outboxResponseSchema>;
