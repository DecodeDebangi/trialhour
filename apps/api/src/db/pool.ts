import pg from 'pg';

// Postgres `date` (OID 1082) would otherwise become a JS Date at *local* midnight, which shifts
// with the server's zone. Shift dates are calendar dates: keep them as "YYYY-MM-DD" strings.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;
/** Anything that can run a query: the pool, or a client inside a transaction. */
export type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

export function createPool(databaseUrl: string): pg.Pool {
  // Session time zone UTC: timestamptz values and now() are never rendered in a server-local zone.
  return new pg.Pool({ connectionString: databaseUrl, options: '-c TimeZone=UTC', max: 10 });
}
