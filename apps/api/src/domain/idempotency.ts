import { createHash } from 'node:crypto';
import type { BookingRequest } from '@codeyoung/shared';

/**
 * Stable fingerprint of a (validated, normalised) booking request. Same key + same
 * fingerprint = a retry; same key + different fingerprint = a client bug (422).
 */
export function requestFingerprint(request: BookingRequest): string {
  const sorted = Object.keys(request).sort();
  return createHash('sha256').update(JSON.stringify(request, sorted)).digest('hex');
}
