// Forward-only migration runner for the Postgres backend.
//
// Applies server/pg/migrations/NNN_name.sql files in version order, each in
// its own transaction, recording applied versions in schema_migrations.
// Usage:
//   node server/pg/migrate.js            (uses DATABASE_URL)
//   import { runMigrations } from './migrate.js'
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool, withTransaction } from './client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const MIGRATION_FILE = /^(\d+)_[A-Za-z0-9_-]+\.sql$/;

export function listMigrations() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .map((name) => {
      const match = MIGRATION_FILE.exec(name);
      return match ? { version: Number(match[1]), name, file: path.join(MIGRATIONS_DIR, name) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.version - b.version);
}

export async function runMigrations({ log = console.log } = {}) {
  await withTransaction(async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `);
  });

  const appliedRows = await getPool().query('SELECT version FROM schema_migrations');
  const applied = new Set(appliedRows.rows.map((row) => Number(row.version)));
  const migrations = listMigrations();
  const pending = migrations.filter((migration) => !applied.has(migration.version));
  if (pending.length === 0) {
    log('[migrate] schema is up to date');
    return { applied: 0, total: migrations.length };
  }

  for (const migration of pending) {
    const sql = fs.readFileSync(migration.file, 'utf8');
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2)',
        [migration.version, new Date().toISOString()],
      );
    });
    log(`[migrate] applied ${migration.name}`);
  }
  return { applied: pending.length, total: migrations.length };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  runMigrations()
    .then(async ({ applied, total }) => {
      console.log(`[migrate] done: ${applied} applied, ${total} known`);
      await getPool().end();
    })
    .catch(async (error) => {
      console.error('[migrate] failed:', error.message);
      await getPool().end();
      process.exitCode = 1;
    });
}
