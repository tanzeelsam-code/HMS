import crypto from 'node:crypto';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const configuredDatabase = process.env.HMS_DB_PATH?.trim();
if (configuredDatabase === ':memory:') throw new Error('An in-memory database cannot be backed up');
const sourcePath = path.resolve(configuredDatabase || path.join(projectRoot, 'server/hms.db'));
const sourceFile = await stat(sourcePath).catch(() => null);
if (!sourceFile?.isFile() || sourceFile.size === 0) {
  throw new Error(`Source database does not exist or is empty: ${sourcePath}`);
}
const backupDirectory = path.resolve(
  process.env.HMS_BACKUP_DIR?.trim() || path.join(projectRoot, 'backups'),
);
await mkdir(backupDirectory, { recursive: true });

const stamp = new Date().toISOString().replaceAll(':', '-');
const targetPath = path.join(
  backupDirectory,
  `nexushos-${stamp}-${crypto.randomBytes(3).toString('hex')}.sqlite`,
);

const source = new DatabaseSync(sourcePath);
try {
  source.prepare('VACUUM INTO ?').run(targetPath);
} finally {
  source.close();
}

const backup = new DatabaseSync(targetPath);
try {
  const integrity = backup.prepare('PRAGMA integrity_check').get();
  if (integrity.integrity_check !== 'ok') {
    throw new Error(`Backup integrity check failed: ${integrity.integrity_check}`);
  }
  const tables = backup.prepare(`
    SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `).get().count;
  console.log(JSON.stringify({ status: 'ok', sourcePath, targetPath, tables }, null, 2));
} finally {
  backup.close();
}
