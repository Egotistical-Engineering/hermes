import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

// Neon requires TLS; `sslmode=require` in the connection string covers it, but
// we default to ssl here so a bare URL also works. Local dev against a plain
// Postgres can set PGSSLMODE=disable.
export const pool = new Pool({
  connectionString,
  ssl: process.env.PGSSLMODE === 'disable' ? undefined : { rejectUnauthorized: true },
  max: 5,
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as never[]);
}
