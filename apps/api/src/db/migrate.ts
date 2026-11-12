import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Pool } from './pool.js';
import { withTransaction } from './tx.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));

/**
 * Applies numbered .sql files in order, once each, each in its own transaction.
 * Returns the names applied in this run. Safe to run repeatedly.
 */
export async function migrate(pool: Pool, dir = MIGRATIONS_DIR): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
  const files = (await readdir(dir)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const applied: string[] = [];

  for (const name of files) {
    const sql = await readFile(`${dir}${name}`, 'utf8');
    const ran = await withTransaction(pool, async (client) => {
      // Serialise concurrent migrators (e.g. two containers starting at once).
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['schema_migrations']);
      const done = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
      if (done.rowCount) return false;
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      return true;
    });
    if (ran) applied.push(name);
  }
  return applied;
}
