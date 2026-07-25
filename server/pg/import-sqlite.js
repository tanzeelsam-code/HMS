// One-time data pump: copy rows from the existing SQLite database into the
// Postgres database. For every table present in BOTH databases it copies the
// column intersection in dependency-safe order, one transaction per table,
// with ON CONFLICT DO NOTHING (safe to re-run).
//
// Usage:
//   HMS_DB_PATH=server/hms.db DATABASE_URL=... node server/pg/import-sqlite.js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { getPool } from './client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dependency-safe order: referenced rows are inserted before referencing rows.
const TABLES = [
  'users',
  'organizations',
  'properties',
  'user_property_memberships',
  'sessions',
  'rooms',
  'reservations',
  'folio_items',
  'gl_accounts',
  'journal_entries',
  'journal_lines',
  'night_audit_postings',
  'folio_journal_postings',
  'housekeeping_tasks',
  'pricing_rules',
  'channels',
  'pos_charges',
  'guest_profiles',
  'maintenance_orders',
  'inventory_items',
  'vendors',
  'purchase_orders',
  'employees',
  'shifts',
  'property_daily_metrics',
  'group_bookings',
  'group_room_blocks',
  'reputation_reviews',
  'esg_metrics',
  'esg_actions',
  'booking_quotes',
  'booking_idempotency',
  'workflow_templates',
  'workflow_runs',
  'workflow_tasks',
  'workflow_audit_events',
  'workflow_event_outbox',
  'webhook_subscriptions',
  'webhook_events',
  'webhook_delivery_attempts',
  'audit_events',
  'api_rate_limit_buckets',
];

export async function importFromSqlite({
  sqlitePath = process.env.HMS_DB_PATH || path.join(__dirname, '..', 'hms.db'),
  log = console.log,
} = {}) {
  const sqlite = new DatabaseSync(path.resolve(sqlitePath), { readOnly: true });
  const pool = getPool();
  const client = await pool.connect();
  const summary = [];
  try {
    const sqliteTables = new Set(
      sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
        .map((row) => row.name),
    );
    const pgColumns = await client.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `);
    const pgColumnsByTable = new Map();
    for (const row of pgColumns.rows) {
      if (!pgColumnsByTable.has(row.table_name)) pgColumnsByTable.set(row.table_name, new Set());
      pgColumnsByTable.get(row.table_name).add(row.column_name);
    }

    for (const table of TABLES) {
      if (!sqliteTables.has(table)) {
        log(`[import] ${table}: skipped (not in SQLite database)`);
        continue;
      }
      const pgCols = pgColumnsByTable.get(table);
      if (!pgCols) {
        log(`[import] ${table}: skipped (not in Postgres schema)`);
        continue;
      }
      const columns = sqlite.prepare(`PRAGMA table_info("${table}")`).all()
        .map((column) => column.name)
        .filter((name) => pgCols.has(name));
      if (columns.length === 0) {
        log(`[import] ${table}: skipped (no common columns)`);
        continue;
      }
      const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all();
      if (rows.length === 0) {
        log(`[import] ${table}: 0 rows`);
        summary.push({ table, rows: 0 });
        continue;
      }
      const columnList = columns.map((name) => `"${name}"`).join(', ');
      const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
      const insertSql = `INSERT INTO "${table}" (${columnList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
      let inserted = 0;
      await client.query('BEGIN');
      try {
        for (const row of rows) {
          const result = await client.query(insertSql, columns.map((name) => row[name]));
          inserted += result.rowCount || 0;
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`[import] ${table}: ${error.message}`);
      }
      log(`[import] ${table}: ${inserted}/${rows.length} rows copied`);
      summary.push({ table, rows: inserted });
    }
  } finally {
    client.release();
    sqlite.close();
  }
  return summary;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  importFromSqlite()
    .then(async (summary) => {
      const total = summary.reduce((sum, entry) => sum + entry.rows, 0);
      console.log(`[import] done: ${total} rows across ${summary.length} tables`);
      await getPool().end();
    })
    .catch(async (error) => {
      console.error('[import] failed:', error.message);
      await getPool().end();
      process.exitCode = 1;
    });
}
