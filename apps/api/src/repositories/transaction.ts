import type { Pool } from '../db/pool.js';
import { withTransaction } from '../db/tx.js';
import { createBookingRepository, type BookingRepository } from './bookingRepo.js';
import { TransientDatabaseError, pgErrorCode } from './errors.js';
import { createIdempotencyRepository, type IdempotencyRepository } from './idempotencyRepo.js';
import { createMentorRepository, type MentorRepository } from './mentorRepo.js';
import { createOutboxRepository, type OutboxRepository } from './outboxRepo.js';

export interface TransactionRepositories {
  mentors: MentorRepository;
  bookings: BookingRepository;
  idempotency: IdempotencyRepository;
  outbox: OutboxRepository;
}

export interface TransactionOptions {
  /** Longest wait for any single lock (e.g. a mentor row held by a stuck request). */
  lockTimeoutMs: number;
  /** Longest any single statement may run. */
  statementTimeoutMs: number;
}

/** Runs `fn` in one transaction with repositories bound to it. Services see no pg types. */
export type RunInTransaction = <T>(
  options: TransactionOptions,
  fn: (repos: TransactionRepositories) => Promise<T>,
) => Promise<T>;

// 55P03 lock_not_available (lock_timeout), 57014 query_canceled (statement_timeout).
const TRANSIENT_CODES = new Set(['55P03', '57014']);

export function createTransactionRunner(pool: Pool): RunInTransaction {
  return async (options, fn) => {
    try {
      return await withTransaction(pool, async (client) => {
        // SET LOCAL equivalents: they end with this transaction and never leak into the pool.
        await client.query(
          `SELECT set_config('lock_timeout', $1, true), set_config('statement_timeout', $2, true)`,
          [`${options.lockTimeoutMs}ms`, `${options.statementTimeoutMs}ms`],
        );
        return fn({
          mentors: createMentorRepository(client),
          bookings: createBookingRepository(client),
          idempotency: createIdempotencyRepository(client),
          outbox: createOutboxRepository(client),
        });
      });
    } catch (error) {
      const code = pgErrorCode(error);
      if (code && TRANSIENT_CODES.has(code)) throw new TransientDatabaseError(code);
      throw error;
    }
  };
}
