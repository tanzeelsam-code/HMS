import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log([
    'Usage: npm run backup',
    '',
    'Required:',
    '  NEXUSHOS_DATABASE_URL  PostgreSQL connection URI for the NexusHOS database',
    '',
    'Optional:',
    '  NEXUSHOS_DB_SCHEMA     Schema to dump, defaults to nexushos',
    '  HMS_BACKUP_DIR         Output directory, defaults to ./backups',
  ].join('\n'));
  process.exit(0);
}

const connectionString = process.env.NEXUSHOS_DATABASE_URL?.trim()
  || process.env.DATABASE_URL?.trim();
if (!connectionString || connectionString.startsWith('pglite://')) {
  throw new Error('A PostgreSQL NEXUSHOS_DATABASE_URL is required for pg_dump backups');
}
const schema = process.env.NEXUSHOS_DB_SCHEMA?.trim() || 'nexushos';
if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid NEXUSHOS_DB_SCHEMA');

const backupDirectory = path.resolve(
  process.env.HMS_BACKUP_DIR?.trim() || path.join(projectRoot, 'backups'),
);
await mkdir(backupDirectory, { recursive: true });
const stamp = new Date().toISOString().replaceAll(':', '-');
const targetPath = path.join(
  backupDirectory,
  `nexushos-${stamp}-${crypto.randomBytes(3).toString('hex')}.dump`,
);

const result = spawnSync('pg_dump', [
  '--format=custom',
  '--no-owner',
  '--no-privileges',
  `--schema=${schema}`,
  `--file=${targetPath}`,
], {
  env: { ...process.env, PGDATABASE: connectionString.replace(/^postgresql\+asyncpg:/, 'postgresql:') },
  encoding: 'utf8',
});
if (result.error?.code === 'ENOENT') {
  throw new Error('pg_dump is not installed; install the PostgreSQL client tools and retry');
}
if (result.status !== 0) throw new Error(result.stderr?.trim() || 'pg_dump failed');

const contents = await readFile(targetPath);
if (!contents.length) throw new Error('pg_dump produced an empty backup');
const manifest = {
  format: 'PostgreSQL custom archive',
  schema,
  createdAt: new Date().toISOString(),
  bytes: contents.length,
  sha256: crypto.createHash('sha256').update(contents).digest('hex'),
};
await writeFile(`${targetPath}.json`, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ status: 'ok', targetPath, ...manifest }, null, 2));
