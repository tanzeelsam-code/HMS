import path from 'node:path';
import { stat } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const candidate = process.argv[2];
if (!candidate) throw new Error('Usage: npm run backup:verify -- /absolute/path/to/backup.sqlite');
const backupPath = path.resolve(candidate);
const file = await stat(backupPath);
if (!file.isFile() || file.size === 0) throw new Error('Backup path must be a non-empty file');

const database = new DatabaseSync(backupPath, { readOnly: true });
try {
  const integrity = database.prepare('PRAGMA integrity_check').get().integrity_check;
  if (integrity !== 'ok') throw new Error(`Integrity check failed: ${integrity}`);
  const counts = {};
  for (const table of ['users', 'rooms', 'reservations', 'journal_entries', 'audit_events']) {
    const exists = database.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
    ).get(table);
    if (exists) counts[table] = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
  }
  console.log(JSON.stringify({ status: 'ok', backupPath, bytes: file.size, counts }, null, 2));
} finally {
  database.close();
}
