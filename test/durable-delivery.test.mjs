import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'nexushos-delivery-'));
process.env.HMS_DB_PATH = path.join(tempDirectory, 'workflow-test.db');

const {
  createWebhookSubscription,
  deliverDueWebhooks,
  enqueueWebhookEvent,
  initializeWebhookSchema,
} = await import('../server/webhooks.js');
const {
  enqueueWorkflowEvent,
  processWorkflowEventOutbox,
} = await import('../server/routes/workflows.js');
const { db } = await import('../server/db.js');

after(() => {
  db.close();
  return rm(tempDirectory, { recursive: true, force: true });
});

test('webhook leases migrate legacy rows, reclaim crashes, and prevent double delivery', async () => {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  database.exec(`
    CREATE TABLE webhook_subscriptions (
      id TEXT PRIMARY KEY, url TEXT NOT NULL, description TEXT,
      event_types_json TEXT NOT NULL, secret_encrypted TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE webhook_events (
      id TEXT PRIMARY KEY, event_type TEXT NOT NULL, occurred_at TEXT NOT NULL,
      request_id TEXT, payload_json TEXT NOT NULL, created_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE webhook_delivery_attempts (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES webhook_events(id),
      subscription_id TEXT NOT NULL REFERENCES webhook_subscriptions(id),
      attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
      status TEXT NOT NULL CHECK (status IN ('Pending', 'Delivering', 'Succeeded', 'Failed')),
      scheduled_at TEXT NOT NULL, started_at TEXT, completed_at TEXT,
      response_status INTEGER, response_body TEXT, error_message TEXT,
      signature_version TEXT, created_at TEXT NOT NULL,
      UNIQUE (event_id, subscription_id, attempt_number)
    ) STRICT;
  `);
  initializeWebhookSchema(database);
  const columns = database.prepare('PRAGMA table_info(webhook_delivery_attempts)')
    .all().map((column) => column.name);
  assert.ok(columns.includes('lease_owner'));
  assert.ok(columns.includes('lease_expires_at'));

  let received = 0;
  let receiverStatus = 204;
  const receiver = http.createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      received++;
      response.writeHead(receiverStatus).end();
    });
  });
  await new Promise((resolve) => receiver.listen(0, '127.0.0.1', resolve));
  const port = receiver.address().port;
  const key = 'test-webhook-encryption-key-material-that-is-long-enough';

  try {
    await createWebhookSubscription({
      url: `http://127.0.0.1:${port}/events`,
      eventTypes: ['reservation.created'],
      createdBy: 'delivery-test',
    }, {
      database,
      key,
      allowPrivateNetworks: true,
      allowInsecureHttp: true,
    });
    const event = enqueueWebhookEvent('reservation.created', { reservationId: 'res-test' }, { database });
    const attempt = database.prepare(
      'SELECT id FROM webhook_delivery_attempts WHERE event_id = ?',
    ).get(event.id);
    // This is exactly how a row abandoned by the pre-lease implementation
    // appears after the additive schema migration.
    database.prepare(`
      UPDATE webhook_delivery_attempts
      SET status = 'Delivering', started_at = ?, lease_owner = NULL, lease_expires_at = NULL
      WHERE id = ?
    `).run(new Date(0).toISOString(), attempt.id);

    const [first, second] = await Promise.all([
      deliverDueWebhooks({
        database,
        key,
        leaseOwner: 'worker-a',
        allowPrivateNetworks: true,
        allowInsecureHttp: true,
      }),
      deliverDueWebhooks({
        database,
        key,
        leaseOwner: 'worker-b',
        allowPrivateNetworks: true,
        allowInsecureHttp: true,
      }),
    ]);
    assert.equal(first.claimed + second.claimed, 1);
    assert.equal(received, 1);
    assert.equal(
      database.prepare('SELECT status FROM webhook_delivery_attempts WHERE id = ?').get(attempt.id).status,
      'Succeeded',
    );

    receiverStatus = 503;
    const failedEvent = enqueueWebhookEvent('reservation.created', { reservationId: 'res-retry' }, { database });
    const failure = await deliverDueWebhooks({
      database,
      key,
      leaseOwner: 'retry-worker',
      maxAttempts: 2,
      baseRetryMs: 1_000,
      allowPrivateNetworks: true,
      allowInsecureHttp: true,
    });
    assert.equal(failure.failed, 1);
    assert.equal(failure.retried, 1);
    assert.deepEqual(
      database.prepare(`
        SELECT attempt_number, status FROM webhook_delivery_attempts
        WHERE event_id = ? ORDER BY attempt_number
      `).all(failedEvent.id).map((row) => ({
        attempt_number: Number(row.attempt_number),
        status: row.status,
      })),
      [
        { attempt_number: 1, status: 'Failed' },
        { attempt_number: 2, status: 'Pending' },
      ],
    );
  } finally {
    await new Promise((resolve) => receiver.close(resolve));
    database.close();
  }
});

test('workflow events commit with domain work and recover an abandoned consumer lease idempotently', () => {
  db.exec('BEGIN');
  const rolledBack = enqueueWorkflowEvent('reservation.created', 'res-rolled-back', {
    confirmationCode: 'GH-ROLLBACK',
  }, { eventVersion: 'GH-ROLLBACK', manageTransaction: false });
  db.exec('ROLLBACK');
  assert.equal(
    db.prepare('SELECT 1 FROM workflow_event_outbox WHERE id = ?').get(rolledBack.id),
    undefined,
  );

  const queued = enqueueWorkflowEvent('reservation.created', 'res-durable', {
    confirmationCode: 'GH-DURABLE',
    guestName: 'Durable Guest',
    roomNumber: '101',
    checkIn: '2026-08-01',
    checkOut: '2026-08-02',
  }, { eventVersion: 'GH-DURABLE' });
  db.prepare(`
    UPDATE workflow_event_outbox
    SET status = 'Processing', attempt_count = 1, lease_owner = 'crashed-worker',
        lease_expires_at = ?
    WHERE id = ?
  `).run(new Date(0).toISOString(), queued.id);

  const processed = processWorkflowEventOutbox({ leaseOwner: 'recovery-worker' });
  assert.equal(processed.claimed, 1);
  assert.equal(processed.completed, 1);
  assert.equal(
    db.prepare('SELECT status FROM workflow_event_outbox WHERE id = ?').get(queued.id).status,
    'Completed',
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM workflow_runs WHERE idempotency_key LIKE 'event:%'").get().count,
    1,
  );

  const replay = enqueueWorkflowEvent('reservation.created', 'res-durable', {
    confirmationCode: 'GH-DURABLE',
  }, { eventVersion: 'GH-DURABLE' });
  assert.equal(replay.id, queued.id);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(processWorkflowEventOutbox().claimed, 0);
});
