import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
try {
  process.loadEnvFile(path.join(projectRoot, '.env'));
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
