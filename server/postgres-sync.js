import {
  MessageChannel,
  Worker,
  receiveMessageOnPort,
} from 'node:worker_threads';
import './load-env.js';

const timeoutMs = Number(process.env.NEXUSHOS_DB_SYNC_TIMEOUT_MS || 35_000);
if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
  throw new Error('NEXUSHOS_DB_SYNC_TIMEOUT_MS must be between 1000 and 120000');
}

const { port1, port2 } = new MessageChannel();
const startupSignal = new Int32Array(new SharedArrayBuffer(4));
const worker = new Worker(new URL('./postgres-worker.js', import.meta.url), {
  workerData: { port: port2, startupSignal: startupSignal.buffer },
  transferList: [port2],
});
const startupWait = Atomics.wait(startupSignal, 0, 0, timeoutMs);
if (startupWait === 'timed-out') {
  worker.terminate();
  throw new Error(`PostgreSQL connection timed out after ${timeoutMs}ms`);
}
if (Atomics.load(startupSignal, 0) !== 1) {
  const startupPacket = receiveMessageOnPort(port1)?.message;
  worker.terminate();
  const error = new Error(startupPacket?.error?.message || 'PostgreSQL worker failed to start');
  Object.assign(error, startupPacket?.error || {});
  throw error;
}
worker.unref();
port1.unref();

let requestId = 0;

function call(operation, sql, parameters = []) {
  const id = ++requestId;
  const signal = new Int32Array(new SharedArrayBuffer(4));
  port1.postMessage({ id, operation, sql, parameters, signal: signal.buffer });
  const waitResult = Atomics.wait(signal, 0, 0, timeoutMs);
  if (waitResult === 'timed-out') {
    throw new Error(`PostgreSQL ${operation} timed out after ${timeoutMs}ms`);
  }
  let packet = receiveMessageOnPort(port1)?.message;
  while (packet && packet.id !== id) packet = receiveMessageOnPort(port1)?.message;
  if (!packet) throw new Error('PostgreSQL worker returned no response');
  if (packet.error) {
    const error = new Error(packet.error.message || 'PostgreSQL query failed');
    Object.assign(error, packet.error);
    throw error;
  }
  return packet.result;
}

class PostgresStatement {
  constructor(sql) {
    this.sql = sql;
  }

  get(...parameters) {
    return call('get', this.sql, parameters).row || undefined;
  }

  all(...parameters) {
    return call('all', this.sql, parameters).rows;
  }

  run(...parameters) {
    return call('run', this.sql, parameters);
  }
}

export class PostgresSyncDatabase {
  prepare(sql) {
    return new PostgresStatement(sql);
  }

  exec(sql) {
    return call('exec', sql);
  }

  secureSchema() {
    return call('secure', '');
  }

  close() {
    worker.terminate();
  }
}
