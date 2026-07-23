import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: npm run backup:verify -- /absolute/path/to/backup.dump');
  process.exit(0);
}

const candidate = process.argv[2];
if (!candidate) throw new Error('Usage: npm run backup:verify -- /absolute/path/to/backup.dump');
const backupPath = path.resolve(candidate);
const file = await stat(backupPath);
if (!file.isFile() || file.size === 0) throw new Error('Backup path must be a non-empty file');

const result = spawnSync('pg_restore', ['--list', backupPath], { encoding: 'utf8' });
if (result.error?.code === 'ENOENT') {
  throw new Error('pg_restore is not installed; install the PostgreSQL client tools and retry');
}
if (result.status !== 0) throw new Error(result.stderr?.trim() || 'pg_restore could not read the archive');

const contents = await readFile(backupPath);
const sha256 = crypto.createHash('sha256').update(contents).digest('hex');
const manifest = await readFile(`${backupPath}.json`, 'utf8')
  .then(JSON.parse)
  .catch(() => null);
if (manifest?.sha256 && manifest.sha256 !== sha256) {
  throw new Error('Backup checksum does not match its manifest');
}
const entries = result.stdout.split('\n').filter((line) => /^\d+;/.test(line)).length;
console.log(JSON.stringify({ status: 'ok', backupPath, bytes: file.size, sha256, entries }, null, 2));
