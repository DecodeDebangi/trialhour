import {
  bookingResponseSchema,
  slotsResponseSchema,
  type BookingRequest,
  type BookingResponse,
  type SlotsResponse,
  type UnavailableReason,
} from '@codeyoung/shared';
import type { z } from 'zod';
import { copy } from '../copy.js';

export type ApiErrorKind =
  'validation' | 'unavailable' | 'busy' | 'not-found' | 'network' | 'server';

/** Every failed API call becomes one of these; components switch on `kind`, never on status. */
export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly fieldErrors: Readonly<Record<string, string>> = {},
    readonly reason?: UnavailableReason,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorBody {
  error?: { message?: string; details?: unknown };
}

function toApiError(status: number, body: ErrorBody | null): ApiError {
  const message = body?.error?.message ?? copy.serverError;
  const details = body?.error?.details;
  if (status === 422) {
    const fieldErrors: Record<string, string> = {};
    if (Array.isArray(details)) {
      for (const d of details as { path?: string; message?: string }[]) {
        if (d.path && d.message && !fieldErrors[d.path]) fieldErrors[d.path] = d.message;
      }
    }
    return new ApiError('validation', message, fieldErrors);
  }
  if (status === 409) {
    const reason = (details as { reason?: UnavailableReason } | undefined)?.reason;
    return new ApiError('unavailable', message, {}, reason);
  }
  if (status === 404) return new ApiError('not-found', message);
  if (status === 503) return new ApiError('busy', copy.busyError);
  return new ApiError('server', copy.serverError);
}

async function request<S extends z.ZodType>(
  path: string,
  schema: S,
  init?: RequestInit,
): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError('network', copy.networkError);
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw toApiError(res.status, body as ErrorBody | null);
  return schema.parse(body);
}

export const api = {
  getSlots(tz: string): Promise<SlotsResponse> {
    return request(`/api/slots?tz=${encodeURIComponent(tz)}`, slotsResponseSchema);
  },

  createBooking(body: BookingRequest, idempotencyKey: string): Promise<BookingResponse> {
    return request('/api/bookings', bookingResponseSchema, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
      body: JSON.stringify(body),
    });
  },

  getBooking(id: string): Promise<BookingResponse> {
    return request(`/api/bookings/${encodeURIComponent(id)}`, bookingResponseSchema);
  },
};
