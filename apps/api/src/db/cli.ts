// Database CLI: `migrate`, `seed`, or `setup` (both). Reads env via the composition config.
import { createClock } from '../clock.js';
import { loadConfig } from '../config.js';
import { migrate } from './migrate.js';
import { createPool } from './pool.js';
import { seed } from './seed.js';

const command = process.argv[2];
if (!command || !['migrate', 'seed', 'setup'].includes(command)) {
  console.error('Usage: cli.ts <migrate|seed|setup>');
  process.exit(2);
}

const config = loadConfig(process.env);
const pool = createPool(config.databaseUrl);
try {
  if (command === 'migrate' || command === 'setup') {
    const applied = await migrate(pool);
    console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Migrations up to date');
  }
  if (command === 'seed' || command === 'setup') {
    const now = createClock(config.nowOverride).now();
    const result = await seed(pool, now, config.mentorDailyCap);
    console.log(
      `Seeded ${result.mentors} mentors, ${result.bookings} bookings (now = ${now.toISO()})`,
    );
  }
} finally {
  await pool.end();
}
