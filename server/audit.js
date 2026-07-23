// Append-only, HMAC-chained security audit events.
//
// PostgreSQL triggers prevent application-level UPDATE/DELETE operations. The
// HMAC chain additionally makes out-of-band alteration or removal detectable
// when the signing key is held outside the database. Periodically export the
// latest sequence/hash to independent storage for a durable external seal.
import crypto from 'node:crypto';
import { db as defaultDb } from './db.js';
import { APPEND_ONLY_CONSTRAINTS_SQL } from './postgres-constraints.js';

export const AUDIT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS audit_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  occurred_at TEXT NOT NULL,
  request_id TEXT,
  actor_id TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'denied')),
  source TEXT NOT NULL,
  network_hash TEXT,
  metadata_json TEXT NOT NULL,
  previous_hash TEXT,
  event_hash TEXT NOT NULL UNIQUE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_audit_events_occurred_at
  ON audit_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor
  ON audit_events (actor_id, sequence DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_action
  ON audit_events (action, sequence DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_resource
  ON audit_events (resource_type, resource_id, sequence DESC);

CREATE TRIGGER IF NOT EXISTS audit_events_reject_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS audit_events_reject_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is append-only');
END;
`;

const OUTCOMES = new Set(['success', 'failure', 'denied']);
const SAFE_ACTION = /^[A-Za-z0-9._:-]{1,160}$/;
const SAFE_TYPE = /^[A-Za-z0-9._:-]{1,100}$/;
const MAX_METADATA_BYTES = 64 * 1024;
const initializedAuditDatabases = new WeakSet();

const requiredText = (value, name, pattern = null) => {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} is required`);
  const normalized = value.trim();
  if (pattern && !pattern.test(normalized)) throw new TypeError(`${name} has an invalid format`);
  return normalized;
};

const optionalText = (value, name, maxLength = 512) => {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new TypeError(`${name} must be a string`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new TypeError(`${name} must contain 1-${maxLength} characters`);
  }
  return normalized;
};

const secretBuffer = (secret, name = 'audit HMAC secret') => {
  const value = Buffer.isBuffer(secret) ? secret : Buffer.from(secret || '', 'utf8');
  if (value.length < 32) throw new TypeError(`${name} must contain at least 32 bytes`);
  return value;
};

function canonicalValue(value, seen = new Set()) {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Audit metadata cannot contain non-finite numbers');
    return value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (typeof value !== 'object') throw new TypeError(`Audit metadata cannot contain ${typeof value}`);
  if (seen.has(value)) throw new TypeError('Audit metadata cannot contain circular references');
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    result = value.map((entry) => entry === undefined ? null : canonicalValue(entry, seen));
  } else {
    result = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) result[key] = canonicalValue(value[key], seen);
    }
  }
  seen.delete(value);
  return result;
}

export const stableJson = (value) => JSON.stringify(canonicalValue(value));

const canonicalAuditPayload = (event) => ({
  id: event.id,
  occurredAt: event.occurredAt,
  requestId: event.requestId,
  actorId: event.actorId,
  actorRole: event.actorRole,
  action: event.action,
  resourceType: event.resourceType,
  resourceId: event.resourceId,
  outcome: event.outcome,
  source: event.source,
  networkHash: event.networkHash,
  metadataJson: event.metadataJson,
  previousHash: event.previousHash,
});

const signAuditPayload = (payload, secret) => crypto
  .createHmac('sha256', secretBuffer(secret))
  .update(stableJson(payload))
  .digest('hex');

const hashNetworkAddress = (address, secret) => {
  if (!address) return null;
  return crypto.createHmac('sha256', secretBuffer(secret))
    .update(`network\0${String(address)}`)
    .digest('hex');
};

const rowToEvent = (row) => row && ({
  sequence: Number(row.sequence),
  id: row.id,
  occurredAt: row.occurred_at,
  requestId: row.request_id,
  actorId: row.actor_id,
  actorRole: row.actor_role,
  action: row.action,
  resourceType: row.resource_type,
  resourceId: row.resource_id,
  outcome: row.outcome,
  source: row.source,
  networkHash: row.network_hash,
  metadata: (() => { try { return JSON.parse(row.metadata_json); } catch { return null; } })(),
  previousHash: row.previous_hash,
  eventHash: row.event_hash,
});

const rowToSignedShape = (row) => ({
  id: row.id,
  occurredAt: row.occurred_at,
  requestId: row.request_id,
  actorId: row.actor_id,
  actorRole: row.actor_role,
  action: row.action,
  resourceType: row.resource_type,
  resourceId: row.resource_id,
  outcome: row.outcome,
  source: row.source,
  networkHash: row.network_hash,
  metadataJson: row.metadata_json,
  previousHash: row.previous_hash,
});

export function initializeAuditSchema(database = defaultDb) {
  if (initializedAuditDatabases.has(database)) return;
  database.exec(AUDIT_SCHEMA_SQL);
  database.exec(APPEND_ONLY_CONSTRAINTS_SQL);
  initializedAuditDatabases.add(database);
}

/**
 * Append a security event. By default it uses BEGIN IMMEDIATE so the previous-
 * hash lookup and insert are atomic. Pass `manageTransaction: false` only while
 * the caller already owns the surrounding business-data transaction.
 */
export function recordAuditEvent(event, {
  database = defaultDb,
  secret = process.env.NEXUSHOS_AUDIT_HMAC_SECRET,
  manageTransaction = true,
} = {}) {
  initializeAuditSchema(database);
  const signingSecret = secretBuffer(secret);
  const occurredAt = event.occurredAt || new Date().toISOString();
  if (!Number.isFinite(Date.parse(occurredAt))) throw new TypeError('occurredAt must be an ISO date-time');

  const metadataJson = stableJson(event.metadata || {});
  if (Buffer.byteLength(metadataJson, 'utf8') > MAX_METADATA_BYTES) {
    throw new TypeError(`Audit metadata cannot exceed ${MAX_METADATA_BYTES} bytes`);
  }
  const outcome = event.outcome || 'success';
  if (!OUTCOMES.has(outcome)) throw new TypeError('outcome must be success, failure, or denied');

  const normalized = {
    id: event.id || `aud-${crypto.randomUUID()}`,
    occurredAt: new Date(occurredAt).toISOString(),
    requestId: optionalText(event.requestId, 'requestId', 128),
    actorId: optionalText(event.actorId, 'actorId', 256),
    actorRole: optionalText(event.actorRole, 'actorRole', 100),
    action: requiredText(event.action, 'action', SAFE_ACTION),
    resourceType: event.resourceType == null
      ? null
      : requiredText(event.resourceType, 'resourceType', SAFE_TYPE),
    resourceId: optionalText(event.resourceId, 'resourceId', 512),
    outcome,
    source: requiredText(event.source || 'api', 'source', SAFE_TYPE),
    networkHash: event.networkHash || hashNetworkAddress(event.networkAddress, signingSecret),
    metadataJson,
    previousHash: null,
  };

  if (manageTransaction) database.exec('BEGIN IMMEDIATE');
  try {
    const previous = database.prepare(
      'SELECT event_hash FROM audit_events ORDER BY sequence DESC LIMIT 1',
    ).get();
    normalized.previousHash = previous?.event_hash || null;
    const eventHash = signAuditPayload(canonicalAuditPayload(normalized), signingSecret);
    const result = database.prepare(`
      INSERT INTO audit_events (
        id, occurred_at, request_id, actor_id, actor_role, action,
        resource_type, resource_id, outcome, source, network_hash,
        metadata_json, previous_hash, event_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING sequence
    `).run(
      normalized.id,
      normalized.occurredAt,
      normalized.requestId,
      normalized.actorId,
      normalized.actorRole,
      normalized.action,
      normalized.resourceType,
      normalized.resourceId,
      normalized.outcome,
      normalized.source,
      normalized.networkHash,
      normalized.metadataJson,
      normalized.previousHash,
      eventHash,
    );
    if (manageTransaction) database.exec('COMMIT');
    return rowToEvent(database.prepare('SELECT * FROM audit_events WHERE sequence = ?')
      .get(Number(result.lastInsertRowid)));
  } catch (error) {
    if (manageTransaction) database.exec('ROLLBACK');
    throw error;
  }
}

export function recordAuditFromRequest(req, event, options = {}) {
  const userAgent = typeof req.headers?.['user-agent'] === 'string'
    ? req.headers['user-agent'].slice(0, 512)
    : null;
  return recordAuditEvent({
    ...event,
    requestId: event.requestId || req.id,
    actorId: event.actorId || req.user?.id,
    actorRole: event.actorRole || req.user?.role,
    networkAddress: event.networkAddress || req.ip || req.socket?.remoteAddress,
    metadata: { ...(event.metadata || {}), userAgent },
  }, options);
}

export function queryAuditEvents({
  database = defaultDb,
  limit = 50,
  beforeSequence,
  action,
  resourceType,
  resourceId,
  actorId,
  outcome,
  from,
  to,
} = {}) {
  initializeAuditSchema(database);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new TypeError('limit must be an integer from 1 to 200');
  }
  const conditions = [];
  const parameters = [];
  if (beforeSequence != null) {
    if (!Number.isInteger(beforeSequence) || beforeSequence < 1) {
      throw new TypeError('beforeSequence must be a positive integer');
    }
    conditions.push('sequence < ?');
    parameters.push(beforeSequence);
  }
  for (const [column, value] of [
    ['action', action],
    ['resource_type', resourceType],
    ['resource_id', resourceId],
    ['actor_id', actorId],
    ['outcome', outcome],
  ]) {
    if (value != null) {
      conditions.push(`${column} = ?`);
      parameters.push(String(value));
    }
  }
  if (from != null) {
    if (!Number.isFinite(Date.parse(from))) throw new TypeError('from must be an ISO date-time');
    conditions.push('occurred_at >= ?');
    parameters.push(new Date(from).toISOString());
  }
  if (to != null) {
    if (!Number.isFinite(Date.parse(to))) throw new TypeError('to must be an ISO date-time');
    conditions.push('occurred_at <= ?');
    parameters.push(new Date(to).toISOString());
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return database.prepare(`
    SELECT * FROM audit_events ${where}
    ORDER BY sequence DESC LIMIT ?
  `).all(...parameters, limit).map(rowToEvent);
}

export function verifyAuditChain({
  database = defaultDb,
  secret = process.env.NEXUSHOS_AUDIT_HMAC_SECRET,
} = {}) {
  initializeAuditSchema(database);
  const signingSecret = secretBuffer(secret);
  const rows = database.prepare('SELECT * FROM audit_events ORDER BY sequence').all();
  let expectedPreviousHash = null;
  for (const row of rows) {
    if (row.previous_hash !== expectedPreviousHash) {
      return {
        valid: false,
        checked: Number(row.sequence) - 1,
        firstInvalidSequence: Number(row.sequence),
        reason: 'previous hash does not match the prior event',
      };
    }
    const expectedHash = signAuditPayload(canonicalAuditPayload(rowToSignedShape(row)), signingSecret);
    const actual = Buffer.from(row.event_hash, 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
      return {
        valid: false,
        checked: Number(row.sequence) - 1,
        firstInvalidSequence: Number(row.sequence),
        reason: 'event HMAC is invalid',
      };
    }
    expectedPreviousHash = row.event_hash;
  }
  return {
    valid: true,
    checked: rows.length,
    lastSequence: rows.length ? Number(rows.at(-1).sequence) : null,
    lastHash: expectedPreviousHash,
  };
}

/**
 * Optional coarse HTTP audit trail for mutating API requests. Domain routes
 * should additionally record explicit business actions and resource IDs.
 */
export function createMutationAuditMiddleware({
  database = defaultDb,
  secret = process.env.NEXUSHOS_AUDIT_HMAC_SECRET,
  onError = (error) => console.error('[audit] unable to append HTTP event', error),
} = {}) {
  return (req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const startedAt = Date.now();
    res.once('finish', () => {
      try {
        const outcome = res.statusCode === 401 || res.statusCode === 403
          ? 'denied'
          : res.statusCode >= 400 ? 'failure' : 'success';
        recordAuditFromRequest(req, {
          action: `http.${req.method.toLowerCase()}`,
          resourceType: 'api-route',
          resourceId: req.originalUrl?.split('?')[0] || req.path,
          outcome,
          source: 'http',
          metadata: {
            method: req.method,
            path: req.originalUrl?.split('?')[0] || req.path,
            statusCode: res.statusCode,
            durationMs: Date.now() - startedAt,
          },
        }, { database, secret });
      } catch (error) {
        onError(error);
      }
    });
    next();
  };
}
