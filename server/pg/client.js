// pg client for the optional Postgres/Supabase backend.
//
// Importing this module has no side effects: the pool is created lazily on
// first use, so the SQLite driver (default) never pays for it. Enable with:
//   HMS_DB_DRIVER=postgres DATABASE_URL=postgresql://...
import pg from 'pg';

let pool;

/**
 * Lazily create and return the shared connection pool. SSL is enabled with
 * rejectUnauthorized:false when the host points at Supabase (managed certs)
 * or when NODE_ENV=production (hosted Postgres typically requires TLS).
 */
export function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not configured');
    const ssl = connectionString.includes('supabase.co') || process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : undefined;
    pool = new pg.Pool({ connectionString, ssl });
  }
  return pool;
}

/** Run a parameterized query against the shared pool. */
export function query(text, params) {
  return getPool().query(text, params);
}

/** Run fn(client) inside BEGIN/COMMIT, rolling back on any error. */
export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** True when the runtime is configured to use Postgres instead of SQLite. */
export function isPostgresEnabled() {
  return process.env.HMS_DB_DRIVER === 'postgres' && !!process.env.DATABASE_URL;
}
