// Encrypted webhook subscriptions and HMAC-signed outbound delivery attempts.
// Delivery state is persisted in the NexusHOS PostgreSQL schema.
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { db as defaultDb } from './db.js';
import { stableJson } from './audit.js';
import { WEBHOOK_CONSTRAINTS_SQL } from './postgres-constraints.js';

export const WEBHOOK_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  description TEXT,
  event_types_json TEXT NOT NULL,
  secret_encrypted TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  request_id TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS webhook_delivery_attempts (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES webhook_events(id),
  subscription_id TEXT NOT NULL REFERENCES webhook_subscriptions(id),
  attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Delivering', 'Succeeded', 'Failed')),
  scheduled_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  response_status INTEGER,
  response_body TEXT,
  error_message TEXT,
  signature_version TEXT,
  lease_owner TEXT,
  lease_expires_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (event_id, subscription_id, attempt_number)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_active
  ON webhook_subscriptions (active, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type_time
  ON webhook_events (event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_attempts_due
  ON webhook_delivery_attempts (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_webhook_attempts_subscription
  ON webhook_delivery_attempts (subscription_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_attempts_event
  ON webhook_delivery_attempts (event_id, attempt_number);

CREATE TRIGGER IF NOT EXISTS webhook_events_reject_update
BEFORE UPDATE ON webhook_events
BEGIN
  SELECT RAISE(ABORT, 'webhook_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS webhook_events_reject_delete
BEFORE DELETE ON webhook_events
BEGIN
  SELECT RAISE(ABORT, 'webhook_events is append-only');
END;
`;

const MAX_PAYLOAD_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 4 * 1024;
const EVENT_SEGMENT = /^[a-z][a-z0-9_-]{0,62}$/;
const ATTEMPT_STATUSES = new Set(['Pending', 'Delivering', 'Succeeded', 'Failed']);
const initializedWebhookDatabases = new WeakSet();

const uid = (prefix) => `${prefix}-${crypto.randomUUID()}`;

const encryptionKey = (value) => {
  const material = Buffer.isBuffer(value) ? value : Buffer.from(value || '', 'utf8');
  if (material.length < 32) {
    throw new TypeError('NEXUSHOS_WEBHOOK_ENCRYPTION_KEY must contain at least 32 bytes');
  }
  return crypto.createHash('sha256').update(material).digest();
};

const signingSecret = (value) => {
  if (typeof value !== 'string' || !value.startsWith('whsec_') || value.length < 40) {
    throw new TypeError('Webhook signing secret has an invalid format');
  }
  return value;
};

const encryptSecret = (plaintext, keyMaterial, subscriptionId) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(keyMaterial), iv);
  cipher.setAAD(Buffer.from(`nexushos-webhook\0${subscriptionId}`, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
};

const decryptSecret = (encoded, keyMaterial, subscriptionId) => {
  const [version, ivPart, tagPart, ciphertextPart] = String(encoded).split('.');
  if (version !== 'v1' || !ivPart || !tagPart || !ciphertextPart) {
    throw new Error('Stored webhook secret has an invalid format');
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(keyMaterial),
    Buffer.from(ivPart, 'base64url'),
  );
  decipher.setAAD(Buffer.from(`nexushos-webhook\0${subscriptionId}`, 'utf8'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
};

const normalizeDescription = (value) => {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 500) {
    throw new TypeError('description must contain 1-500 characters');
  }
  return value.trim();
};

const normalizeEventType = (value, { allowWildcard = false } = {}) => {
  if (typeof value !== 'string') throw new TypeError('Webhook event types must be strings');
  const normalized = value.trim().toLowerCase();
  if (allowWildcard && normalized === '*') return normalized;
  const wildcard = allowWildcard && normalized.endsWith('.*');
  const base = wildcard ? normalized.slice(0, -2) : normalized;
  const segments = base.split('.');
  if (!base || segments.some((segment) => !EVENT_SEGMENT.test(segment))) {
    throw new TypeError(`Invalid webhook event type: ${value}`);
  }
  return wildcard ? `${base}.*` : base;
};

const normalizeEventTypes = (values) => {
  if (!Array.isArray(values) || values.length < 1 || values.length > 100) {
    throw new TypeError('eventTypes must contain between 1 and 100 entries');
  }
  return [...new Set(values.map((value) => normalizeEventType(value, { allowWildcard: true })))].sort();
};

const matchesEventType = (patterns, eventType) => patterns.some((pattern) => pattern === '*'
  || pattern === eventType
  || (pattern.endsWith('.*') && eventType.startsWith(`${pattern.slice(0, -2)}.`)));

const isBlockedIpv4 = (address) => {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = octets;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 192 && b === 88 && c === 99)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224;
};

const isBlockedIpv6 = (address) => {
  const normalized = address.toLowerCase().split('%')[0];
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice(7);
    return net.isIP(mapped) === 4 ? isBlockedIpv4(mapped) : true;
  }
  return normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || /^fe[89ab]/.test(normalized)
    || normalized.startsWith('ff')
    || normalized.startsWith('2001:db8:');
};

const isBlockedAddress = (address) => {
  const family = net.isIP(address);
  return family === 4 ? isBlockedIpv4(address) : family === 6 ? isBlockedIpv6(address) : true;
};

/**
 * Resolve and validate a webhook target before every connection. The returned
 * IP is pinned into the HTTP request, reducing DNS-rebinding/SSRF exposure.
 */
export async function resolveWebhookTarget(value, {
  allowPrivateNetworks = false,
  allowInsecureHttp = false,
} = {}) {
  let url;
  try { url = new URL(value); } catch { throw new TypeError('url must be a valid absolute URL'); }
  if (url.protocol !== 'https:' && !(allowInsecureHttp && url.protocol === 'http:')) {
    throw new TypeError('Webhook URLs must use HTTPS');
  }
  if (url.username || url.password) throw new TypeError('Webhook URLs cannot contain credentials');
  if (url.hash) throw new TypeError('Webhook URLs cannot contain fragments');
  if (!url.hostname || url.toString().length > 2048) throw new TypeError('Webhook URL is invalid or too long');
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!allowPrivateNetworks && (
    hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
  )) throw new TypeError('Webhook URL cannot target a local network name');

  let addresses;
  if (net.isIP(hostname)) {
    addresses = [{ address: hostname, family: net.isIP(hostname) }];
  } else {
    try {
      addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new TypeError('Webhook hostname could not be resolved');
    }
  }
  if (!addresses.length) throw new TypeError('Webhook hostname did not resolve to an address');
  if (!allowPrivateNetworks && addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new TypeError('Webhook URL resolves to a private, reserved, or non-routable address');
  }
  const target = addresses[0];
  return { url, address: target.address, family: target.family };
}

export function signWebhookPayload(secret, { timestamp, deliveryId, body }) {
  signingSecret(secret);
  if (!Number.isInteger(timestamp) || timestamp < 1) throw new TypeError('timestamp must be Unix seconds');
  if (typeof deliveryId !== 'string' || !deliveryId) throw new TypeError('deliveryId is required');
  if (typeof body !== 'string') throw new TypeError('body must be the exact serialized payload string');
  const digest = crypto.createHmac('sha256', secret)
    .update(`${timestamp}.${deliveryId}.${body}`, 'utf8')
    .digest('hex');
  return `v1=${digest}`;
}

export function verifyWebhookSignature(secret, { timestamp, deliveryId, body, signature, toleranceSeconds = 300 }) {
  if (!Number.isInteger(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > toleranceSeconds) {
    return false;
  }
  let expected;
  try { expected = signWebhookPayload(secret, { timestamp, deliveryId, body }); } catch { return false; }
  const actualBuffer = Buffer.from(String(signature || ''), 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

const sendRequest = ({ target, body, headers, timeoutMs }) => new Promise((resolve, reject) => {
  const { url, address, family } = target;
  const transport = url.protocol === 'https:' ? https : http;
  const request = transport.request({
    protocol: url.protocol,
    hostname: address,
    family,
    port: url.port || undefined,
    path: `${url.pathname}${url.search}`,
    method: 'POST',
    servername: net.isIP(url.hostname.replace(/^\[|\]$/g, '')) ? undefined : url.hostname,
    headers: {
      ...headers,
      Host: url.host,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body, 'utf8'),
      'User-Agent': 'NexusHOS-Webhooks/1.0',
    },
  }, (response) => {
    const chunks = [];
    let size = 0;
    response.on('data', (chunk) => {
      if (size >= MAX_RESPONSE_BYTES) return;
      const remaining = MAX_RESPONSE_BYTES - size;
      chunks.push(chunk.subarray(0, remaining));
      size += Math.min(chunk.length, remaining);
    });
    response.on('end', () => resolve({
      status: response.statusCode || 0,
      body: Buffer.concat(chunks).toString('utf8'),
    }));
  });
  request.setTimeout(timeoutMs, () => request.destroy(new Error(`Webhook timed out after ${timeoutMs}ms`)));
  request.on('error', reject);
  request.end(body);
});

const parseJson = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };

const publicSubscription = (row) => row && ({
  id: row.id,
  url: row.url,
  description: row.description,
  eventTypes: parseJson(row.event_types_json, []),
  active: !!row.active,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const publicAttempt = (row) => row && ({
  id: row.id,
  eventId: row.event_id,
  eventType: row.event_type,
  subscriptionId: row.subscription_id,
  subscriptionUrl: row.subscription_url,
  attemptNumber: Number(row.attempt_number),
  status: row.status,
  scheduledAt: row.scheduled_at,
  startedAt: row.started_at,
  completedAt: row.completed_at,
  responseStatus: row.response_status,
  responseBody: row.response_body,
  error: row.error_message,
  signatureVersion: row.signature_version,
  createdAt: row.created_at,
});

export function initializeWebhookSchema(database = defaultDb) {
  if (initializedWebhookDatabases.has(database)) return;
  database.exec(WEBHOOK_SCHEMA_SQL);
  database.exec(WEBHOOK_CONSTRAINTS_SQL);
  // Additive migration for databases created before delivery leases existed.
  // The column check keeps initialization idempotent because every public
  // webhook operation calls this function before touching the tables.
  const columns = new Set(database.prepare(
    'PRAGMA table_info(webhook_delivery_attempts)',
  ).all().map((column) => column.name));
  for (const [name, definition] of [
    ['lease_owner', 'TEXT'],
    ['lease_expires_at', 'TEXT'],
  ]) {
    if (columns.has(name)) continue;
    try {
      database.exec(`ALTER TABLE webhook_delivery_attempts ADD COLUMN ${name} ${definition}`);
      columns.add(name);
    } catch (error) {
      // Another server process may have won the same startup migration. Only
      // suppress that race when the expected column is now actually present.
      const migrated = database.prepare('PRAGMA table_info(webhook_delivery_attempts)')
        .all().some((column) => column.name === name);
      if (!migrated) throw error;
      columns.add(name);
    }
  }
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_webhook_attempts_lease
      ON webhook_delivery_attempts (status, lease_expires_at, scheduled_at);
  `);
  initializedWebhookDatabases.add(database);
}

export async function createWebhookSubscription({
  url,
  description,
  eventTypes,
  createdBy,
}, {
  database = defaultDb,
  key = process.env.NEXUSHOS_WEBHOOK_ENCRYPTION_KEY,
  allowPrivateNetworks = false,
  allowInsecureHttp = false,
} = {}) {
  initializeWebhookSchema(database);
  encryptionKey(key);
  if (typeof createdBy !== 'string' || !createdBy.trim()) throw new TypeError('createdBy is required');
  const target = await resolveWebhookTarget(url, { allowPrivateNetworks, allowInsecureHttp });
  const id = uid('whsub');
  const secret = `whsec_${crypto.randomBytes(32).toString('base64url')}`;
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO webhook_subscriptions
      (id, url, description, event_types_json, secret_encrypted, active, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).run(
    id,
    target.url.toString(),
    normalizeDescription(description),
    JSON.stringify(normalizeEventTypes(eventTypes)),
    encryptSecret(secret, key, id),
    createdBy.trim(),
    now,
    now,
  );
  return {
    subscription: publicSubscription(database.prepare('SELECT * FROM webhook_subscriptions WHERE id = ?').get(id)),
    signingSecret: secret,
  };
}

export function listWebhookSubscriptions({ database = defaultDb, includeInactive = true } = {}) {
  initializeWebhookSchema(database);
  const rows = includeInactive
    ? database.prepare('SELECT * FROM webhook_subscriptions ORDER BY created_at DESC').all()
    : database.prepare('SELECT * FROM webhook_subscriptions WHERE active = 1 ORDER BY created_at DESC').all();
  return rows.map(publicSubscription);
}

export async function updateWebhookSubscription(id, changes, {
  database = defaultDb,
  key = process.env.NEXUSHOS_WEBHOOK_ENCRYPTION_KEY,
  allowPrivateNetworks = false,
  allowInsecureHttp = false,
} = {}) {
  initializeWebhookSchema(database);
  const existing = database.prepare('SELECT * FROM webhook_subscriptions WHERE id = ?').get(id);
  if (!existing) return null;
  const next = {
    url: existing.url,
    description: existing.description,
    eventTypesJson: existing.event_types_json,
    encryptedSecret: existing.secret_encrypted,
    active: existing.active,
  };
  let rotatedSecret;
  if (Object.hasOwn(changes, 'url')) {
    next.url = (await resolveWebhookTarget(changes.url, { allowPrivateNetworks, allowInsecureHttp })).url.toString();
  }
  if (Object.hasOwn(changes, 'description')) next.description = normalizeDescription(changes.description);
  if (Object.hasOwn(changes, 'eventTypes')) {
    next.eventTypesJson = JSON.stringify(normalizeEventTypes(changes.eventTypes));
  }
  if (Object.hasOwn(changes, 'active')) {
    if (typeof changes.active !== 'boolean') throw new TypeError('active must be a boolean');
    next.active = changes.active ? 1 : 0;
  }
  if (changes.rotateSecret === true) {
    encryptionKey(key);
    rotatedSecret = `whsec_${crypto.randomBytes(32).toString('base64url')}`;
    next.encryptedSecret = encryptSecret(rotatedSecret, key, id);
  }
  const now = new Date().toISOString();
  database.prepare(`
    UPDATE webhook_subscriptions SET
      url = ?, description = ?, event_types_json = ?, secret_encrypted = ?, active = ?, updated_at = ?
    WHERE id = ?
  `).run(next.url, next.description, next.eventTypesJson, next.encryptedSecret, next.active, now, id);
  return {
    subscription: publicSubscription(database.prepare('SELECT * FROM webhook_subscriptions WHERE id = ?').get(id)),
    ...(rotatedSecret ? { signingSecret: rotatedSecret } : {}),
  };
}

export function disableWebhookSubscription(id, { database = defaultDb } = {}) {
  initializeWebhookSchema(database);
  const result = database.prepare(
    'UPDATE webhook_subscriptions SET active = 0, updated_at = ? WHERE id = ?',
  ).run(new Date().toISOString(), id);
  return Number(result.changes) > 0;
}

/**
 * Persist one immutable event and its initial delivery attempts. Call outside
 * an already-open PostgreSQL transaction, or pass `manageTransaction: false` to
 * include the outbox write atomically in a transaction the caller already owns.
 */
export function enqueueWebhookEvent(eventType, payload, {
  database = defaultDb,
  requestId = null,
  occurredAt = new Date().toISOString(),
  subscriptionIds = null,
  ignoreEventTypeFilter = false,
  manageTransaction = true,
} = {}) {
  initializeWebhookSchema(database);
  const normalizedType = normalizeEventType(eventType);
  if (!Number.isFinite(Date.parse(occurredAt))) throw new TypeError('occurredAt must be an ISO date-time');
  const payloadJson = stableJson(payload);
  if (Buffer.byteLength(payloadJson, 'utf8') > MAX_PAYLOAD_BYTES) {
    throw new TypeError(`Webhook payload cannot exceed ${MAX_PAYLOAD_BYTES} bytes`);
  }
  if (subscriptionIds != null && (!Array.isArray(subscriptionIds)
    || subscriptionIds.some((id) => typeof id !== 'string'))) {
    throw new TypeError('subscriptionIds must be an array of strings');
  }

  const candidates = database.prepare(
    'SELECT * FROM webhook_subscriptions WHERE active = 1 ORDER BY id',
  ).all().filter((row) => (
    (!subscriptionIds || subscriptionIds.includes(row.id))
    && (ignoreEventTypeFilter || matchesEventType(parseJson(row.event_types_json, []), normalizedType))
  ));
  const id = uid('whevt');
  const now = new Date().toISOString();
  if (manageTransaction) database.exec('BEGIN');
  try {
    database.prepare(`
      INSERT INTO webhook_events (id, event_type, occurred_at, request_id, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, normalizedType, new Date(occurredAt).toISOString(), requestId, payloadJson, now);
    const insertAttempt = database.prepare(`
      INSERT INTO webhook_delivery_attempts
        (id, event_id, subscription_id, attempt_number, status, scheduled_at, created_at)
      VALUES (?, ?, ?, 1, 'Pending', ?, ?)
    `);
    for (const subscription of candidates) {
      insertAttempt.run(uid('whdel'), id, subscription.id, now, now);
    }
    if (manageTransaction) database.exec('COMMIT');
  } catch (error) {
    if (manageTransaction) database.exec('ROLLBACK');
    throw error;
  }
  return { id, eventType: normalizedType, occurredAt: new Date(occurredAt).toISOString(), queued: candidates.length };
}

const deliveryRows = (database, where, parameters, limit) => database.prepare(`
  SELECT a.*, e.event_type, e.occurred_at, e.request_id, e.payload_json,
         s.url AS subscription_url, s.secret_encrypted, s.active AS subscription_active
  FROM webhook_delivery_attempts a
  JOIN webhook_events e ON e.id = a.event_id
  JOIN webhook_subscriptions s ON s.id = a.subscription_id
  ${where}
  ORDER BY a.scheduled_at, a.id
  LIMIT ?
`).all(...parameters, limit);

export function listWebhookDeliveryAttempts({
  database = defaultDb,
  limit = 50,
  subscriptionId,
  eventId,
  status,
} = {}) {
  initializeWebhookSchema(database);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new TypeError('limit must be an integer from 1 to 200');
  }
  if (status != null && !ATTEMPT_STATUSES.has(status)) throw new TypeError('Invalid delivery status');
  const conditions = [];
  const parameters = [];
  if (subscriptionId) { conditions.push('a.subscription_id = ?'); parameters.push(subscriptionId); }
  if (eventId) { conditions.push('a.event_id = ?'); parameters.push(eventId); }
  if (status) { conditions.push('a.status = ?'); parameters.push(status); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return deliveryRows(database, where, parameters, limit).map(publicAttempt);
}

export async function deliverDueWebhooks({
  database = defaultDb,
  key = process.env.NEXUSHOS_WEBHOOK_ENCRYPTION_KEY,
  limit = 25,
  timeoutMs = 10_000,
  leaseDurationMs,
  leaseOwner = `whwrk-${crypto.randomUUID()}`,
  maxAttempts = 6,
  baseRetryMs = 30_000,
  maxRetryMs = 60 * 60 * 1000,
  allowPrivateNetworks = false,
  allowInsecureHttp = false,
} = {}) {
  initializeWebhookSchema(database);
  encryptionKey(key);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new TypeError('limit must be 1-100');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) {
    throw new TypeError('timeoutMs must be 100-120000');
  }
  if (typeof leaseOwner !== 'string' || !leaseOwner.trim() || leaseOwner.length > 200) {
    throw new TypeError('leaseOwner must contain 1-200 characters');
  }
  const effectiveLeaseMs = leaseDurationMs == null
    ? Math.max(60_000, timeoutMs * 2 + 5_000)
    : leaseDurationMs;
  if (!Number.isInteger(effectiveLeaseMs)
    || effectiveLeaseMs <= timeoutMs
    || effectiveLeaseMs > 15 * 60 * 1000) {
    throw new TypeError('leaseDurationMs must exceed timeoutMs and be at most 900000');
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
    throw new TypeError('maxAttempts must be 1-20');
  }
  const normalizedLeaseOwner = leaseOwner.trim();
  const summary = {
    claimed: 0,
    succeeded: 0,
    failed: 0,
    retried: 0,
    leaseLost: 0,
  };

  for (let claimNumber = 0; claimNumber < limit; claimNumber++) {
    const startedAt = new Date().toISOString();
    const leaseExpiresAt = new Date(Date.now() + effectiveLeaseMs).toISOString();
    // Selection and claim happen in one PostgreSQL statement. Competing workers
    // cannot both obtain the same row, and an abandoned Delivering row becomes
    // eligible again only after its lease expires (or immediately when it came
    // from a pre-lease version and therefore has no expiry).
    const claimed = database.prepare(`
      UPDATE webhook_delivery_attempts
      SET status = 'Delivering', started_at = ?, completed_at = NULL,
          response_status = NULL, response_body = NULL, error_message = NULL,
          signature_version = NULL, lease_owner = ?, lease_expires_at = ?
      WHERE id = (
        SELECT id FROM webhook_delivery_attempts
        WHERE (
          (status = 'Pending' AND scheduled_at <= ?)
          OR (status = 'Delivering' AND (lease_expires_at IS NULL OR lease_expires_at <= ?))
        )
        ORDER BY scheduled_at, id
        LIMIT 1
      )
      RETURNING id
    `).get(
      startedAt,
      normalizedLeaseOwner,
      leaseExpiresAt,
      startedAt,
      startedAt,
    );
    if (!claimed) break;
    const attempt = deliveryRows(database, 'WHERE a.id = ?', [claimed.id], 1)[0];
    if (!attempt) {
      // Foreign-key enforcement should make this impossible, but release the
      // row for a future recovery attempt instead of leaving a hidden lease.
      database.prepare(`
        UPDATE webhook_delivery_attempts
        SET status = 'Pending', lease_owner = NULL, lease_expires_at = NULL
        WHERE id = ? AND status = 'Delivering' AND lease_owner = ?
      `).run(claimed.id, normalizedLeaseOwner);
      continue;
    }
    summary.claimed++;

    let responseStatus = null;
    let responseBody = null;
    let errorMessage = null;
    let success = false;
    try {
      if (!attempt.subscription_active) throw new Error('Webhook subscription is inactive');
      const secret = decryptSecret(attempt.secret_encrypted, key, attempt.subscription_id);
      signingSecret(secret);
      const body = stableJson({
        id: attempt.event_id,
        type: attempt.event_type,
        occurredAt: attempt.occurred_at,
        data: parseJson(attempt.payload_json, null),
      });
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = signWebhookPayload(secret, { timestamp, deliveryId: attempt.id, body });
      const target = await resolveWebhookTarget(attempt.subscription_url, {
        allowPrivateNetworks,
        allowInsecureHttp,
      });
      const response = await sendRequest({
        target,
        body,
        timeoutMs,
        headers: {
          'X-Nexus-Event': attempt.event_type,
          'X-Nexus-Event-ID': attempt.event_id,
          'X-Nexus-Delivery-ID': attempt.id,
          'X-Nexus-Timestamp': String(timestamp),
          'X-Nexus-Signature': signature,
        },
      });
      responseStatus = response.status;
      responseBody = response.body;
      success = response.status >= 200 && response.status < 300;
      if (!success) errorMessage = `Webhook returned HTTP ${response.status}`;
    } catch (error) {
      errorMessage = String(error?.message || error).slice(0, 2048);
    }

    const completedAt = new Date().toISOString();
    let retryInserted = false;
    database.exec('BEGIN IMMEDIATE');
    try {
      // Ownership is part of the completion predicate. If a slow worker loses
      // its lease and another worker reclaims the row, the former can no longer
      // overwrite the newer result or schedule a duplicate retry.
      const completed = database.prepare(`
        UPDATE webhook_delivery_attempts SET
          status = ?, completed_at = ?, response_status = ?, response_body = ?,
          error_message = ?, signature_version = 'v1',
          lease_owner = NULL, lease_expires_at = NULL
        WHERE id = ? AND status = 'Delivering' AND lease_owner = ?
      `).run(
        success ? 'Succeeded' : 'Failed',
        completedAt,
        responseStatus,
        responseBody,
        errorMessage,
        attempt.id,
        normalizedLeaseOwner,
      );
      if (Number(completed.changes) === 1
        && !success
        && Number(attempt.attempt_number) < maxAttempts
        && attempt.subscription_active) {
        const retryMs = Math.min(maxRetryMs, baseRetryMs * (2 ** (Number(attempt.attempt_number) - 1)));
        const scheduledAt = new Date(Date.now() + retryMs).toISOString();
        const retry = database.prepare(`
          INSERT INTO webhook_delivery_attempts
            (id, event_id, subscription_id, attempt_number, status, scheduled_at, created_at)
          VALUES (?, ?, ?, ?, 'Pending', ?, ?)
          ON CONFLICT(event_id, subscription_id, attempt_number) DO NOTHING
        `).run(
          uid('whdel'),
          attempt.event_id,
          attempt.subscription_id,
          Number(attempt.attempt_number) + 1,
          scheduledAt,
          completedAt,
        );
        retryInserted = Number(retry.changes) === 1;
      }
      database.exec('COMMIT');
      if (Number(completed.changes) !== 1) {
        summary.leaseLost++;
        continue;
      }
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
    if (success) summary.succeeded++;
    else summary.failed++;
    if (retryInserted) summary.retried++;
  }
  return summary;
}
