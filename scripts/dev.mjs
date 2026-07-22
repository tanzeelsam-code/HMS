import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));

const services = [
  {
    name: 'api',
    // Keep the API in sync with backend edits during local development. Vite
    // already hot-reloads the client; Node's watcher prevents an older auth or
    // schema implementation from remaining attached to the current database.
    args: ['--watch', 'server/index.js'],
    env: { ...process.env, PORT: '4000' },
  },
  {
    name: 'client',
    args: [vite],
    env: process.env,
  },
];

const children = new Map();
const closed = new Set();
let stopping = false;
let requestedExitCode = 0;

function finishIfStopped() {
  if (stopping && closed.size === children.size) {
    process.exit(requestedExitCode);
  }
}

function stop(exitCode, signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  requestedExitCode = exitCode;

  for (const child of children.values()) {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  }

  const forceExit = setTimeout(() => {
    for (const child of children.values()) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
    process.exit(requestedExitCode);
  }, 5_000);
  forceExit.unref();
  finishIfStopped();
}

for (const service of services) {
  const child = spawn(process.execPath, service.args, {
    cwd: root,
    env: service.env,
    stdio: 'inherit',
  });
  children.set(service.name, child);

  child.on('error', (error) => {
    console.error(`[dev] ${service.name} could not start: ${error.message}`);
    stop(1);
  });

  child.on('close', (code, signal) => {
    closed.add(service.name);
    if (!stopping) {
      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      console.error(`[dev] ${service.name} stopped (${reason}); stopping the other service.`);
      stop(code && code > 0 ? code : 1);
    }
    finishIfStopped();
  });
}

process.on('SIGINT', () => stop(0, 'SIGINT'));
process.on('SIGTERM', () => stop(0, 'SIGTERM'));
