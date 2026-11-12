import { z } from 'zod';
import {
  ASSIGNMENT_STRATEGY_NAMES,
  type AssignmentStrategyName,
} from './domain/assignment/strategy.js';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    MIN_NOTICE_MINUTES: z.coerce.number().int().min(0).default(240),
    // ≤ 30 so the default slots range (today … today + horizon) stays within MAX_RANGE_DAYS (31).
    BOOKING_HORIZON_DAYS: z.coerce.number().int().min(1).max(30).default(14),
    MENTOR_DAILY_CAP: z.coerce.number().int().min(1).default(2),
    ASSIGNMENT_STRATEGY: z.enum(ASSIGNMENT_STRATEGY_NAMES).default('capacity-preserving'),
    NOW_OVERRIDE: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((env) => !(env.NODE_ENV === 'production' && env.NOW_OVERRIDE), {
    message: 'NOW_OVERRIDE is not allowed when NODE_ENV=production',
    path: ['NOW_OVERRIDE'],
  });

export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  databaseUrl: string;
  port: number;
  minNoticeMinutes: number;
  bookingHorizonDays: number;
  mentorDailyCap: number;
  assignmentStrategy: AssignmentStrategyName;
  nowOverride: string | undefined;
}

/**
 * Parses configuration from an env-like record. The composition root passes process.env;
 * nothing else in the app reads the environment.
 */
export function loadConfig(env: Record<string, string | undefined>): Config {
  // Treat empty strings (e.g. `NOW_OVERRIDE=` in .env) as unset.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ''));
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  const e = result.data;
  return {
    nodeEnv: e.NODE_ENV,
    databaseUrl: e.DATABASE_URL,
    port: e.PORT,
    minNoticeMinutes: e.MIN_NOTICE_MINUTES,
    bookingHorizonDays: e.BOOKING_HORIZON_DAYS,
    mentorDailyCap: e.MENTOR_DAILY_CAP,
    assignmentStrategy: e.ASSIGNMENT_STRATEGY,
    nowOverride: e.NOW_OVERRIDE,
  };
}
