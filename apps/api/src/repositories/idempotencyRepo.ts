import type { Queryable } from '../db/pool.js';

export interface StoredIdempotentResponse {
  requestHash: string;
  responseStatus: number | null;
  responseBody: unknown;
}

export interface IdempotencyRepository {
  /**
   * Claims the key inside the current transaction. Returns false if another request already
   * holds it. A concurrent claim waits on the primary key until the first transaction ends:
   * if that one commits, this returns false; if it rolls back, this claim succeeds.
   */
  claim(key: string, requestHash: string): Promise<boolean>;
  complete(key: string, bookingId: string, status: number, body: unknown): Promise<void>;
  find(key: string): Promise<StoredIdempotentResponse | null>;
}

export function createIdempotencyRepository(db: Queryable): IdempotencyRepository {
  return {
    async claim(key, requestHash) {
      const { rowCount } = await db.query(
        `INSERT INTO idempotency_keys (key, request_hash) VALUES ($1, $2)
         ON CONFLICT (key) DO NOTHING`,
        [key, requestHash],
      );
      return rowCount === 1;
    },

    async complete(key, bookingId, status, body) {
      await db.query(
        `UPDATE idempotency_keys
            SET booking_id = $2, response_status = $3, response_body = $4
          WHERE key = $1`,
        [key, bookingId, status, JSON.stringify(body)],
      );
    },

    async find(key) {
      const { rows } = await db.query<{
        request_hash: string;
        response_status: number | null;
        response_body: unknown;
      }>(
        'SELECT request_hash, response_status, response_body FROM idempotency_keys WHERE key = $1',
        [key],
      );
      const r = rows[0];
      return r
        ? {
            requestHash: r.request_hash,
            responseStatus: r.response_status,
            responseBody: r.response_body,
          }
        : null;
    },
  };
}
