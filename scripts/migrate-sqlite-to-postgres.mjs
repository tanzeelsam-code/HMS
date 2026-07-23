import crypto from 'node:crypto';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const sourcePath = path.resolve(
  process.argv.find((value) => value.startsWith('--source='))?.slice('--source='.length)
    || process.env.HMS_DB_PATH?.trim()
    || path.join(projectRoot, 'server/hms.db'),
);
const merge = process.argv.includes('--merge');
const dryRun = process.argv.includes('--dry-run');

if (!process.env.NEXUSHOS_DATABASE_URL?.trim() && !process.env.DATABASE_URL?.trim()) {
  throw new Error('Set NEXUSHOS_DATABASE_URL before running the migration');
}
if (!existsSync(sourcePath)) throw new Error(`SQLite source does not exist: ${sourcePath}`);

process.env.NEXUSHOS_SKIP_SEED = 'true';
const { db, DB_SCHEMA } = await import('../server/db.js');
const { initializeAuditSchema } = await import('../server/audit.js');
const { initializeSecuritySchema } = await import('../server/security.js');
const { initializeWebhookSchema } = await import('../server/webhooks.js');
await import('../server/routes/booking.js');
await import('../server/routes/workflows.js');

initializeAuditSchema(db);
initializeSecuritySchema(db);
initializeWebhookSchema(db);
db.secureSchema();

const source = new DatabaseSync(sourcePath, { readOnly: true });
const safeIdentifier = (value) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `"${value}"`;
};

const tableOrder = [
  'users', 'rooms', 'reservations', 'folio_items', 'housekeeping_tasks',
  'pricing_rules', 'channels', 'pos_charges', 'guest_profiles', 'maintenance_orders',
  'gl_accounts', 'journal_entries', 'journal_lines', 'inventory_items', 'vendors',
  'purchase_orders', 'employees', 'shifts', 'organizations', 'properties',
  'user_property_memberships', 'property_daily_metrics', 'group_bookings',
  'group_room_blocks', 'reputation_reviews', 'esg_metrics', 'esg_actions',
  'night_audit_postings', 'folio_journal_postings', 'booking_quotes',
  'booking_idempotency', 'workflow_templates', 'workflow_runs', 'workflow_tasks',
  'workflow_audit_events', 'workflow_event_outbox', 'webhook_subscriptions',
  'webhook_events', 'webhook_delivery_attempts', 'audit_events',
  'api_rate_limit_buckets',
];

const sourceTables = new Set(source.prepare(`
  SELECT name FROM sqlite_master
  WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
`).all().map((row) => row.name));
const targetTables = new Set(db.prepare(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
`).all().map((row) => row.table_name));

const nonEmptyTarget = tableOrder.filter((table) => {
  if (!targetTables.has(table) || table === 'gl_accounts') return false;
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${safeIdentifier(table)}`).get().count) > 0;
});
if (nonEmptyTarget.length && !merge) {
  throw new Error(
    `Target schema ${DB_SCHEMA} already contains data in: ${nonEmptyTarget.join(', ')}. `
    + 'Use an empty schema or rerun with --merge to keep existing conflicting rows.',
  );
}

const sourceReservationCodes = new Set();
const targetReservationCodes = new Set(
  targetTables.has('reservations')
    ? db.prepare('SELECT code FROM reservations WHERE code IS NOT NULL').all().map((row) => row.code)
    : [],
);
const uniqueReservationCode = (value) => {
  if (value && !sourceReservationCodes.has(value) && !targetReservationCodes.has(value)) {
    sourceReservationCodes.add(value);
    return value;
  }
  let replacement;
  do replacement = `GH-${crypto.randomInt(100000, 1_000_000)}`;
  while (sourceReservationCodes.has(replacement) || targetReservationCodes.has(replacement));
  sourceReservationCodes.add(replacement);
  return replacement;
};

const summary = [];
try {
  if (!dryRun) db.exec('BEGIN');
  for (const table of tableOrder) {
    if (!sourceTables.has(table) || !targetTables.has(table)) continue;
    const sourceColumns = source.prepare(`PRAGMA table_info(${safeIdentifier(table)})`).all();
    const targetColumns = db.prepare(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ?
      ORDER BY ordinal_position
    `).all(table).map((row) => row.column_name);
    const targetByLower = new Map(targetColumns.map((column) => [column.toLowerCase(), column]));
    const columnPairs = sourceColumns.map(({ name }) => {
      const special = table === 'shifts' && name === 'start'
        ? 'start_time'
        : table === 'shifts' && name === 'end' ? 'end_time' : null;
      const target = special || targetByLower.get(name.toLowerCase());
      return target ? { source: name, target } : null;
    }).filter(Boolean);
    if (!columnPairs.length) continue;

    const rows = source.prepare(`SELECT * FROM ${safeIdentifier(table)}`).all();
    let inserted = 0;
    if (!dryRun) {
      const columnsSql = columnPairs.map(({ target }) => safeIdentifier(target)).join(', ');
      const placeholders = columnPairs.map(() => '?').join(', ');
      const statement = db.prepare(`
        INSERT INTO ${safeIdentifier(table)} (${columnsSql})
        VALUES (${placeholders})
        ON CONFLICT DO NOTHING
      `);
      for (const row of rows) {
        const values = columnPairs.map(({ source: column }) => {
          if (table === 'reservations' && column === 'code') return uniqueReservationCode(row[column]);
          return row[column];
        });
        inserted += Number(statement.run(...values).changes);
      }
    }
    summary.push({ table, source: rows.length, inserted: dryRun ? null : inserted });
  }

  if (!dryRun && sourceTables.has('audit_events') && targetTables.has('audit_events')) {
    db.exec(`
      SELECT setval(
        pg_get_serial_sequence('audit_events', 'sequence'),
        GREATEST(COALESCE((SELECT MAX(sequence) FROM audit_events), 1), 1),
        EXISTS (SELECT 1 FROM audit_events)
      )
    `);
  }
  if (!dryRun) db.exec('COMMIT');
} catch (error) {
  if (!dryRun) {
    try { db.exec('ROLLBACK'); } catch {}
  }
  throw error;
} finally {
  source.close();
}

// The baseline creates the canonical chart of accounts before imports so
// legacy rows for those same stable IDs are expected to conflict harmlessly.
const mismatches = summary.filter((item) => item.table !== 'gl_accounts'
  && item.inserted != null && item.inserted < item.source);
console.log(JSON.stringify({
  status: dryRun ? 'dry-run' : mismatches.length ? 'merged-with-conflicts' : 'migrated',
  sourcePath,
  targetSchema: DB_SCHEMA,
  tables: summary,
  conflicts: mismatches,
}, null, 2));
db.close();
