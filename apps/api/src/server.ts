// Composition root: the only place that reads the environment and wires real implementations.
import { createApp } from './app.js';
import { createClock } from './clock.js';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';
import { createBookingRepository } from './repositories/bookingRepo.js';
import { createMentorRepository } from './repositories/mentorRepo.js';
import { SlotService } from './services/slotService.js';

const config = loadConfig(process.env);
const pool = createPool(config.databaseUrl);
const clock = createClock(config.nowOverride);
const policy = {
  minNoticeMinutes: config.minNoticeMinutes,
  horizonDays: config.bookingHorizonDays,
  dailyCap: config.mentorDailyCap,
};

const slotService = new SlotService({
  mentors: createMentorRepository(pool),
  bookings: createBookingRepository(pool),
  clock,
  policy,
});

const app = createApp({
  slotService,
  checkDatabase: async () => {
    await pool.query('SELECT 1');
  },
});

const server = app.listen(config.port, () => {
  const fixed = config.nowOverride ? ` (clock frozen at ${config.nowOverride})` : '';
  console.log(`API listening on http://localhost:${config.port}${fixed}`);
});

function shutdown() {
  server.close(() => void pool.end().then(() => process.exit(0)));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
