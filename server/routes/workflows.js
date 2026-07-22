// routes/workflows.js — persisted frontline workflow automation and task execution.
import crypto from 'node:crypto';
import { Router } from 'express';
import { db, tx, uid } from '../db.js';
import { requireRoles } from '../auth.js';

const r = Router();
const operationalRoles = requireRoles('General Manager', 'Front Desk', 'Housekeeping', 'Finance');
const requireGeneralManager = requireRoles('General Manager');

const RISK_LEVELS = new Set(['Low', 'Medium', 'High', 'Critical']);
const APPROVAL_MODES = new Set(['risk-based', 'always', 'never']);
const TEMPLATE_STATUSES = new Set(['Active', 'Paused', 'Archived']);
const TASK_STATUSES = new Set(['Open', 'In Progress', 'Blocked', 'Completed', 'Cancelled']);
const TASK_PRIORITIES = new Set(['Low', 'Normal', 'High', 'Urgent']);
const TERMINAL_TASK_STATUSES = new Set(['Completed', 'Cancelled']);
const MAX_JSON_BYTES = 32 * 1024;

// This feature owns its additive schema. Importing and mounting the router is
// enough to make an existing NexusHOS database compatible without touching the
// core bootstrap or relying on a destructive migration.
db.exec(`
CREATE TABLE IF NOT EXISTS workflow_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  trigger_type TEXT NOT NULL,
  trigger_config TEXT NOT NULL DEFAULT '{}',
  actions TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('Low', 'Medium', 'High', 'Critical')),
  approval_mode TEXT NOT NULL CHECK (approval_mode IN ('risk-based', 'always', 'never')),
  status TEXT NOT NULL CHECK (status IN ('Active', 'Paused', 'Archived')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES workflow_templates(id),
  template_version INTEGER NOT NULL,
  template_snapshot TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Awaiting Approval', 'Running', 'Completed', 'Rejected', 'Failed')),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('Low', 'Medium', 'High', 'Critical')),
  approval_required INTEGER NOT NULL CHECK (approval_required IN (0, 1)),
  context TEXT NOT NULL DEFAULT '{}',
  execution_output TEXT NOT NULL DEFAULT '{}',
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  approved_by TEXT,
  approved_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS workflow_tasks (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES workflow_runs(id),
  template_id TEXT REFERENCES workflow_templates(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL,
  assigned_to TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL CHECK (priority IN ('Low', 'Normal', 'High', 'Urgent')),
  status TEXT NOT NULL CHECK (status IN ('Open', 'In Progress', 'Blocked', 'Completed', 'Cancelled')),
  room_number TEXT,
  due_at TEXT,
  completed_at TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_audit_events (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_event_outbox (
  id TEXT PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_version TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '{}',
  actor TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Processing', 'Completed', 'Failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TEXT NOT NULL,
  lease_owner TEXT,
  lease_expires_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_workflow_templates_status
  ON workflow_templates(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_template
  ON workflow_runs(template_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status
  ON workflow_runs(status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_status_due
  ON workflow_tasks(status, due_at);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_run
  ON workflow_tasks(run_id);
CREATE INDEX IF NOT EXISTS idx_workflow_audit_entity
  ON workflow_audit_events(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_event_outbox_due
  ON workflow_event_outbox(status, available_at, lease_expires_at);

CREATE TRIGGER IF NOT EXISTS trg_workflow_audit_events_no_update
BEFORE UPDATE ON workflow_audit_events
BEGIN
  SELECT RAISE(ABORT, 'workflow audit events are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_workflow_audit_events_no_delete
BEFORE DELETE ON workflow_audit_events
BEGIN
  SELECT RAISE(ABORT, 'workflow audit events are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_workflow_runs_immutable_request
BEFORE UPDATE OF
  template_id, template_version, template_snapshot, idempotency_key,
  request_fingerprint, risk_level, approval_required, context,
  requested_by, requested_at
ON workflow_runs
BEGIN
  SELECT RAISE(ABORT, 'workflow run request evidence is immutable');
END;
`);

const nowIso = () => new Date().toISOString();
const actorFor = (req) => req.user?.email || req.user?.name || 'Unknown user';

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function assertPlainObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw httpError(400, `${fieldName} must be an object`);
  }
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded, 'utf8') > MAX_JSON_BYTES) {
    throw httpError(400, `${fieldName} must be smaller than ${MAX_JSON_BYTES} bytes`);
  }
  return value;
}

function normalizedText(value, fieldName, { required = false, max = 500 } = {}) {
  if (value == null && !required) return '';
  if (typeof value !== 'string') throw httpError(400, `${fieldName} must be a string`);
  const normalized = value.trim();
  if (required && !normalized) throw httpError(400, `${fieldName} is required`);
  if (normalized.length > max) throw httpError(400, `${fieldName} must be ${max} characters or fewer`);
  return normalized;
}

function listLimit(value, fallback = 100) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 200) {
    throw httpError(400, 'limit must be an integer from 1 to 200');
  }
  return parsed;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

const stableStringify = (value) => JSON.stringify(stableValue(value));
const fingerprint = (value) => crypto.createHash('sha256').update(stableStringify(value)).digest('hex');

function serializeTemplate(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    triggerType: row.trigger_type,
    triggerConfig: parseJson(row.trigger_config, {}),
    actions: parseJson(row.actions, []),
    riskLevel: row.risk_level,
    approvalMode: row.approval_mode,
    status: row.status,
    version: row.version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
    runCount: row.run_count ?? undefined,
    lastRunAt: row.last_run_at ?? null,
  };
}

function serializeTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    runId: row.run_id,
    templateId: row.template_id,
    title: row.title,
    description: row.description,
    department: row.department,
    assignedTo: row.assigned_to,
    priority: row.priority,
    status: row.status,
    roomNumber: row.room_number,
    dueAt: row.due_at,
    completedAt: row.completed_at,
    metadata: parseJson(row.metadata, {}),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

function serializeAuditEvent(row) {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    actor: row.actor,
    details: parseJson(row.details, {}),
    createdAt: row.created_at,
  };
}

function serializeRun(row, { includeDetails = false } = {}) {
  if (!row) return null;
  const snapshot = parseJson(row.template_snapshot, {});
  const result = {
    id: row.id,
    templateId: row.template_id,
    templateName: snapshot.name || row.template_name || 'Workflow',
    templateVersion: row.template_version,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    riskLevel: row.risk_level,
    approvalRequired: Boolean(row.approval_required),
    context: parseJson(row.context, {}),
    executionOutput: parseJson(row.execution_output, {}),
    requestedBy: row.requested_by,
    requestedAt: row.requested_at,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    completedAt: row.completed_at,
    taskCount: row.task_count ?? undefined,
  };
  if (includeDetails) {
    result.templateSnapshot = snapshot;
    result.tasks = db.prepare('SELECT * FROM workflow_tasks WHERE run_id = ? ORDER BY created_at, id')
      .all(row.id).map(serializeTask);
    result.audit = db.prepare(`
      SELECT * FROM workflow_audit_events
      WHERE entity_type = 'run' AND entity_id = ?
      ORDER BY created_at, id`).all(row.id).map(serializeAuditEvent);
  }
  return result;
}

function audit(entityType, entityId, action, actor, details = {}) {
  const id = uid('wae');
  db.prepare(`
    INSERT INTO workflow_audit_events
      (id, entity_type, entity_id, action, actor, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, entityType, entityId, action, actor, JSON.stringify(details), nowIso());
  return id;
}

function normalizeAction(action, index) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    throw httpError(400, `actions[${index}] must be an object`);
  }
  if (action.type === 'create_task') {
    const priority = action.priority ?? 'Normal';
    if (!TASK_PRIORITIES.has(priority)) {
      throw httpError(400, `actions[${index}].priority must be Low, Normal, High, or Urgent`);
    }
    const dueInMinutes = action.dueInMinutes ?? 60;
    if (!Number.isInteger(dueInMinutes) || dueInMinutes < 0 || dueInMinutes > 43200) {
      throw httpError(400, `actions[${index}].dueInMinutes must be an integer from 0 to 43200`);
    }
    const metadata = action.metadata == null ? {} : assertPlainObject(action.metadata, `actions[${index}].metadata`);
    return {
      type: 'create_task',
      title: normalizedText(action.title, `actions[${index}].title`, { required: true, max: 140 }),
      description: normalizedText(action.description, `actions[${index}].description`, { max: 1200 }),
      department: normalizedText(action.department, `actions[${index}].department`, { required: true, max: 80 }),
      assignedTo: normalizedText(action.assignedTo, `actions[${index}].assignedTo`, { max: 120 }),
      priority,
      roomNumber: normalizedText(action.roomNumber, `actions[${index}].roomNumber`, { max: 40 }),
      dueInMinutes,
      metadata,
    };
  }
  if (action.type === 'audit_note') {
    return {
      type: 'audit_note',
      message: normalizedText(action.message, `actions[${index}].message`, { required: true, max: 1000 }),
    };
  }
  throw httpError(400, `actions[${index}].type must be create_task or audit_note`);
}

function normalizeActions(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw httpError(400, 'actions must contain between 1 and 20 workflow actions');
  }
  return value.map(normalizeAction);
}

function normalizeTemplate(body, existing = null) {
  const source = body || {};
  const base = existing ? serializeTemplate(existing) : null;
  const name = source.name === undefined && base
    ? base.name
    : normalizedText(source.name, 'name', { required: true, max: 100 });
  const description = source.description === undefined && base
    ? base.description
    : normalizedText(source.description, 'description', { max: 700 });
  const triggerType = source.triggerType === undefined && base
    ? base.triggerType
    : normalizedText(source.triggerType ?? 'manual', 'triggerType', { required: true, max: 80 });
  if (!/^[a-z][a-z0-9._-]*$/i.test(triggerType)) {
    throw httpError(400, 'triggerType may contain letters, numbers, dots, underscores, and hyphens');
  }
  const triggerConfig = source.triggerConfig === undefined && base
    ? base.triggerConfig
    : assertPlainObject(source.triggerConfig ?? {}, 'triggerConfig');
  const actions = source.actions === undefined && base ? base.actions : normalizeActions(source.actions);
  // Existing actions came from already-validated storage; normalize updates and
  // creates alike so future schema changes still fail safely.
  const normalizedActions = normalizeActions(actions);
  const riskLevel = source.riskLevel ?? base?.riskLevel ?? 'Low';
  const approvalMode = source.approvalMode ?? base?.approvalMode ?? 'risk-based';
  const status = source.status ?? base?.status ?? 'Active';
  if (!RISK_LEVELS.has(riskLevel)) throw httpError(400, 'riskLevel must be Low, Medium, High, or Critical');
  if (!APPROVAL_MODES.has(approvalMode)) throw httpError(400, 'approvalMode must be risk-based, always, or never');
  if (!TEMPLATE_STATUSES.has(status)) throw httpError(400, 'status must be Active, Paused, or Archived');
  if ((riskLevel === 'High' || riskLevel === 'Critical') && approvalMode === 'never') {
    throw httpError(400, 'High and Critical workflows cannot bypass manager approval');
  }
  return { name, description, triggerType, triggerConfig, actions: normalizedActions, riskLevel, approvalMode, status };
}

function requiresApproval(template) {
  if (template.approvalMode === 'always') return true;
  if (template.approvalMode === 'never') return false;
  return template.riskLevel === 'High' || template.riskLevel === 'Critical';
}

function contextValue(context, path) {
  let value = context;
  for (const key of path.split('.')) {
    if (!value || typeof value !== 'object' || !(key in value)) return '';
    value = value[key];
  }
  return ['string', 'number', 'boolean'].includes(typeof value) ? String(value) : '';
}

function renderTemplate(value, context) {
  return String(value || '').replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_match, path) => contextValue(context, path));
}

function executeRun(runId, snapshot, context, actor, approvalDecision) {
  const startedAt = nowIso();
  const actionOutputs = [];
  const createdTaskIds = [];
  const runAuditEventIds = [];

  snapshot.actions.forEach((action, index) => {
    if (action.type === 'create_task') {
      const taskId = uid('wtask');
      const createdAt = nowIso();
      const title = renderTemplate(action.title, context).trim() || 'Workflow task';
      const dueAt = new Date(Date.now() + action.dueInMinutes * 60_000).toISOString();
      db.prepare(`
        INSERT INTO workflow_tasks
          (id, run_id, template_id, title, description, department, assigned_to,
           priority, status, room_number, due_at, completed_at, metadata,
           created_by, created_at, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Open', ?, ?, NULL, ?, ?, ?, ?, ?)`)
        .run(
          taskId,
          runId,
          snapshot.id,
          title,
          renderTemplate(action.description, context).trim(),
          renderTemplate(action.department, context).trim() || 'Operations',
          renderTemplate(action.assignedTo, context).trim(),
          action.priority,
          renderTemplate(action.roomNumber, context).trim() || null,
          dueAt,
          JSON.stringify(action.metadata || {}),
          actor,
          createdAt,
          actor,
          createdAt,
        );
      audit('task', taskId, 'created_by_workflow', actor, { runId, templateId: snapshot.id, actionIndex: index });
      createdTaskIds.push(taskId);
      actionOutputs.push({ index, type: action.type, status: 'created', taskId, title, dueAt });
      return;
    }

    const auditEventId = audit('run', runId, 'workflow_note', actor, {
      actionIndex: index,
      message: renderTemplate(action.message, context).trim(),
    });
    runAuditEventIds.push(auditEventId);
    actionOutputs.push({ index, type: action.type, status: 'recorded', auditEventId });
  });

  const completedAt = nowIso();
  const output = {
    schemaVersion: 1,
    decision: {
      riskLevel: snapshot.riskLevel,
      approvalMode: snapshot.approvalMode,
      approvalRequired: requiresApproval(snapshot),
      outcome: approvalDecision,
    },
    startedAt,
    completedAt,
    actions: actionOutputs,
    createdTaskIds,
    auditEventIds: runAuditEventIds,
  };
  db.prepare(`
    UPDATE workflow_runs
    SET status = 'Completed', execution_output = ?, completed_at = ?
    WHERE id = ?`).run(JSON.stringify(output), completedAt, runId);
  audit('run', runId, 'execution_completed', actor, {
    createdTaskIds,
    actionCount: actionOutputs.length,
    approvalDecision,
  });
  return output;
}

function runById(id) {
  return db.prepare(`
    SELECT wr.*, wt.name AS template_name,
      (SELECT COUNT(*) FROM workflow_tasks task WHERE task.run_id = wr.id) AS task_count
    FROM workflow_runs wr
    JOIN workflow_templates wt ON wt.id = wr.template_id
    WHERE wr.id = ?`).get(id);
}

function startWorkflowRun({ templateRow, key, context, actor }) {
  const template = serializeTemplate(templateRow);
  if (template.status !== 'Active') {
    throw httpError(409, `Only Active workflows can run; this template is ${template.status}`);
  }
  const requestFingerprint = fingerprint({ templateId: template.id, templateVersion: template.version, context });
  const existing = db.prepare('SELECT * FROM workflow_runs WHERE idempotency_key = ?').get(key);
  if (existing) {
    if (existing.request_fingerprint !== requestFingerprint) {
      throw httpError(409, 'This idempotency key was already used with a different workflow request');
    }
    return {
      run: serializeRun(runById(existing.id), { includeDetails: true }),
      idempotentReplay: true,
      approvalRequired: !!existing.approval_required,
    };
  }

  const runId = uid('wrun');
  const requestedAt = nowIso();
  const approvalRequired = requiresApproval(template);
  const snapshot = {
    id: template.id,
    name: template.name,
    version: template.version,
    triggerType: template.triggerType,
    actions: template.actions,
    riskLevel: template.riskLevel,
    approvalMode: template.approvalMode,
  };
  const queuedOutput = {
    schemaVersion: 1,
    decision: {
      riskLevel: template.riskLevel,
      approvalMode: template.approvalMode,
      approvalRequired,
      outcome: approvalRequired ? 'awaiting-manager-approval' : 'auto-approved-by-policy',
    },
    actions: template.actions.map((action, index) => ({ index, type: action.type, status: 'pending' })),
    createdTaskIds: [],
  };

  tx(() => {
    db.prepare(`
      INSERT INTO workflow_runs
        (id, template_id, template_version, template_snapshot, idempotency_key,
         request_fingerprint, status, risk_level, approval_required, context,
         execution_output, requested_by, requested_at, approved_by, approved_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`)
      .run(
        runId,
        template.id,
        template.version,
        JSON.stringify(snapshot),
        key,
        requestFingerprint,
        approvalRequired ? 'Awaiting Approval' : 'Running',
        template.riskLevel,
        approvalRequired ? 1 : 0,
        JSON.stringify(context),
        JSON.stringify(queuedOutput),
        actor,
        requestedAt,
      );
    audit('run', runId, 'requested', actor, {
      templateId: template.id,
      templateVersion: template.version,
      riskLevel: template.riskLevel,
      approvalRequired,
      idempotencyKey: key,
    });
    if (approvalRequired) {
      audit('run', runId, 'approval_requested', actor, { riskLevel: template.riskLevel });
    } else {
      audit('run', runId, 'auto_approved', 'Policy Engine', {
        riskLevel: template.riskLevel,
        approvalMode: template.approvalMode,
      });
      executeRun(runId, snapshot, context, actor, 'auto-approved-by-policy');
    }
  });

  return {
    run: serializeRun(runById(runId), { includeDetails: true }),
    idempotentReplay: false,
    approvalRequired,
  };
}

// Domain routes can publish a stable event after their transaction commits.
// Matching active templates are idempotent per event/template/version.
export function dispatchWorkflowEvent(eventType, aggregateId, context = {}, {
  eventVersion = '1',
  actor = 'Nexus Event Engine',
} = {}) {
  const normalizedEventType = normalizedText(eventType, 'eventType', { required: true, max: 80 });
  if (!/^[a-z][a-z0-9._-]*$/i.test(normalizedEventType)) {
    throw httpError(400, 'eventType has an invalid format');
  }
  const normalizedAggregateId = normalizedText(String(aggregateId || ''), 'aggregateId', { required: true, max: 200 });
  const normalizedVersion = normalizedText(String(eventVersion), 'eventVersion', { required: true, max: 80 });
  const eventContext = assertPlainObject(context, 'context');
  const templates = db.prepare(`
    SELECT * FROM workflow_templates
    WHERE trigger_type = ? AND status = 'Active'
    ORDER BY id
  `).all(normalizedEventType);
  const results = [];
  for (const templateRow of templates) {
    const eventKey = `event:${fingerprint({
      eventType: normalizedEventType,
      aggregateId: normalizedAggregateId,
      eventVersion: normalizedVersion,
      templateId: templateRow.id,
    }).slice(0, 48)}`;
    const result = startWorkflowRun({ templateRow, key: eventKey, context: eventContext, actor });
    results.push({
      templateId: templateRow.id,
      runId: result.run.id,
      status: result.run.status,
      idempotentReplay: result.idempotentReplay,
    });
  }
  return { eventType: normalizedEventType, matched: templates.length, runs: results };
}

/**
 * Persist an event in the same transaction as the domain change that produced
 * it. The deterministic key makes API replays harmless; the first durable
 * payload wins and `eventVersion` is the caller's explicit change boundary.
 */
export function enqueueWorkflowEvent(eventType, aggregateId, context = {}, {
  eventVersion = '1',
  actor = 'Nexus Event Engine',
  manageTransaction = true,
} = {}) {
  const normalizedEventType = normalizedText(eventType, 'eventType', { required: true, max: 80 });
  if (!/^[a-z][a-z0-9._-]*$/i.test(normalizedEventType)) {
    throw httpError(400, 'eventType has an invalid format');
  }
  const normalizedAggregateId = normalizedText(String(aggregateId || ''), 'aggregateId', {
    required: true,
    max: 200,
  });
  const normalizedVersion = normalizedText(String(eventVersion), 'eventVersion', {
    required: true,
    max: 80,
  });
  const normalizedActor = normalizedText(actor, 'actor', { required: true, max: 200 });
  const eventContext = assertPlainObject(context, 'context');
  const eventKey = `workflow-event:${fingerprint({
    eventType: normalizedEventType,
    aggregateId: normalizedAggregateId,
    eventVersion: normalizedVersion,
  })}`;
  const id = uid('wfevt');
  const createdAt = nowIso();
  const insert = () => {
    const result = db.prepare(`
      INSERT INTO workflow_event_outbox
        (id, event_key, event_type, aggregate_id, event_version, context, actor,
         status, attempt_count, available_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', 0, ?, ?)
      ON CONFLICT(event_key) DO NOTHING
    `).run(
      id,
      eventKey,
      normalizedEventType,
      normalizedAggregateId,
      normalizedVersion,
      stableStringify(eventContext),
      normalizedActor,
      createdAt,
      createdAt,
    );
    const row = Number(result.changes) === 1
      ? db.prepare('SELECT * FROM workflow_event_outbox WHERE id = ?').get(id)
      : db.prepare('SELECT * FROM workflow_event_outbox WHERE event_key = ?').get(eventKey);
    return {
      id: row.id,
      eventKey,
      status: row.status,
      idempotentReplay: Number(result.changes) !== 1,
    };
  };
  return manageTransaction ? tx(insert) : insert();
}

/**
 * Drain a bounded number of durable workflow events. Claiming is a single
 * SQLite statement with a lease, so another process can safely reclaim a row
 * after a worker crash. Workflow-run idempotency protects the commit/ack gap:
 * if a worker dies after creating runs but before completing the outbox row,
 * replay observes those runs instead of duplicating them.
 */
export function processWorkflowEventOutbox({
  limit = 25,
  maxAttempts = 10,
  baseRetryMs = 1_000,
  maxRetryMs = 15 * 60 * 1000,
  leaseDurationMs = 60_000,
  leaseOwner = `wfwrk-${crypto.randomUUID()}`,
} = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new TypeError('limit must be an integer from 1 to 100');
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 50) {
    throw new TypeError('maxAttempts must be an integer from 1 to 50');
  }
  if (!Number.isInteger(baseRetryMs) || baseRetryMs < 0
    || !Number.isInteger(maxRetryMs) || maxRetryMs < baseRetryMs) {
    throw new TypeError('Workflow retry delays are invalid');
  }
  if (!Number.isInteger(leaseDurationMs) || leaseDurationMs < 1_000 || leaseDurationMs > 15 * 60 * 1000) {
    throw new TypeError('leaseDurationMs must be an integer from 1000 to 900000');
  }
  if (typeof leaseOwner !== 'string' || !leaseOwner.trim() || leaseOwner.length > 200) {
    throw new TypeError('leaseOwner must contain 1-200 characters');
  }

  const owner = leaseOwner.trim();
  const summary = { claimed: 0, completed: 0, retried: 0, failed: 0, leaseLost: 0 };
  const recoveryAt = nowIso();
  const exhaustedLeases = db.prepare(`
    UPDATE workflow_event_outbox
    SET status = 'Failed', last_error = COALESCE(last_error,
        'Worker lease expired after the maximum processing attempts'),
        lease_owner = NULL, lease_expires_at = NULL
    WHERE attempt_count >= ? AND (
      (status = 'Pending' AND available_at <= ?)
      OR (status = 'Processing' AND (lease_expires_at IS NULL OR lease_expires_at <= ?))
    )
  `).run(maxAttempts, recoveryAt, recoveryAt);
  summary.failed += Number(exhaustedLeases.changes);
  for (let claimNumber = 0; claimNumber < limit; claimNumber++) {
    const claimedAt = nowIso();
    const leaseExpiresAt = new Date(Date.now() + leaseDurationMs).toISOString();
    const event = db.prepare(`
      UPDATE workflow_event_outbox
      SET status = 'Processing',
          attempt_count = attempt_count + 1,
          lease_owner = ?, lease_expires_at = ?, last_error = NULL
      WHERE id = (
        SELECT id FROM workflow_event_outbox
        WHERE (
          (status = 'Pending' AND attempt_count < ? AND available_at <= ?)
          OR (status = 'Processing' AND attempt_count < ?
              AND (lease_expires_at IS NULL OR lease_expires_at <= ?))
        )
        ORDER BY available_at, id
        LIMIT 1
      )
      RETURNING *
    `).get(owner, leaseExpiresAt, maxAttempts, claimedAt, maxAttempts, claimedAt);
    if (!event) break;
    summary.claimed++;

    let errorMessage = null;
    try {
      dispatchWorkflowEvent(
        event.event_type,
        event.aggregate_id,
        parseJson(event.context, {}),
        { eventVersion: event.event_version, actor: event.actor },
      );
    } catch (error) {
      errorMessage = String(error?.message || error).slice(0, 2048);
    }

    const finishedAt = nowIso();
    let updated;
    if (!errorMessage) {
      updated = db.prepare(`
        UPDATE workflow_event_outbox
        SET status = 'Completed', completed_at = ?, lease_owner = NULL,
            lease_expires_at = NULL, last_error = NULL
        WHERE id = ? AND status = 'Processing' AND lease_owner = ?
      `).run(finishedAt, event.id, owner);
      if (Number(updated.changes) === 1) summary.completed++;
    } else {
      const exhausted = Number(event.attempt_count) >= maxAttempts;
      const retryMs = Math.min(
        maxRetryMs,
        baseRetryMs * (2 ** Math.max(0, Number(event.attempt_count) - 1)),
      );
      const availableAt = new Date(Date.now() + retryMs).toISOString();
      updated = db.prepare(`
        UPDATE workflow_event_outbox
        SET status = ?, available_at = ?, last_error = ?, lease_owner = NULL,
            lease_expires_at = NULL
        WHERE id = ? AND status = 'Processing' AND lease_owner = ?
      `).run(exhausted ? 'Failed' : 'Pending', availableAt, errorMessage, event.id, owner);
      if (Number(updated.changes) === 1) {
        if (exhausted) summary.failed++;
        else summary.retried++;
      }
    }
    if (Number(updated.changes) !== 1) summary.leaseLost++;
  }
  return summary;
}

function taskPayload(body, { partial = false } = {}) {
  const source = body || {};
  const payload = {};
  const textFields = [
    ['title', 140, true],
    ['description', 1200, false],
    ['department', 80, true],
    ['assignedTo', 120, false],
    ['roomNumber', 40, false],
  ];
  for (const [field, max, required] of textFields) {
    if (source[field] !== undefined || !partial) {
      payload[field] = normalizedText(source[field], field, { required, max });
    }
  }
  if (source.priority !== undefined || !partial) {
    payload.priority = source.priority ?? 'Normal';
    if (!TASK_PRIORITIES.has(payload.priority)) {
      throw httpError(400, 'priority must be Low, Normal, High, or Urgent');
    }
  }
  if (source.status !== undefined) {
    if (!TASK_STATUSES.has(source.status)) {
      throw httpError(400, 'status must be Open, In Progress, Blocked, Completed, or Cancelled');
    }
    payload.status = source.status;
  }
  if (source.dueAt !== undefined) {
    if (source.dueAt !== null && (typeof source.dueAt !== 'string' || !Number.isFinite(Date.parse(source.dueAt)))) {
      throw httpError(400, 'dueAt must be null or a valid ISO date-time');
    }
    payload.dueAt = source.dueAt ? new Date(source.dueAt).toISOString() : null;
  }
  if (source.metadata !== undefined || !partial) {
    payload.metadata = source.metadata == null ? {} : assertPlainObject(source.metadata, 'metadata');
  }
  return payload;
}

// A small, deterministic starter set makes the vertical slice immediately
// useful while remaining fully editable and auditable.
const seededAt = nowIso();
const insertStarter = db.prepare(`
  INSERT OR IGNORE INTO workflow_templates
    (id, name, description, trigger_type, trigger_config, actions, risk_level,
     approval_mode, status, version, created_by, created_at, updated_by, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Active', 1, 'System', ?, 'System', ?)`);
insertStarter.run(
  'wf-vip-arrival-readiness',
  'VIP arrival readiness',
  'Creates a cross-department preparation task from guest and room context.',
  'reservation.vip-arrival',
  '{}',
  JSON.stringify([
    {
      type: 'create_task',
      title: 'Prepare VIP arrival for {{guestName}}',
      description: 'Confirm welcome amenity, preferences, and final room inspection for room {{roomNumber}}. {{note}}',
      department: 'Guest Experience',
      assignedTo: 'Duty Manager Queue',
      priority: 'High',
      roomNumber: '{{roomNumber}}',
      dueInMinutes: 45,
      metadata: { source: 'starter-template' },
    },
    { type: 'audit_note', message: 'VIP readiness workflow requested for room {{roomNumber}}.' },
  ]),
  'Medium',
  'risk-based',
  seededAt,
  seededAt,
);
insertStarter.run(
  'wf-direct-booking-follow-up',
  'Direct booking follow-up',
  'Creates a front-office review task whenever the public booking engine confirms a stay.',
  'reservation.created',
  '{}',
  JSON.stringify([
    {
      type: 'create_task',
      title: 'Review direct booking {{confirmationCode}}',
      description: 'Confirm requests and arrival notes for {{guestName}} staying {{checkIn}} to {{checkOut}}.',
      department: 'Front Office',
      assignedTo: 'Reservations Queue',
      priority: 'Normal',
      roomNumber: '{{roomNumber}}',
      dueInMinutes: 30,
      metadata: { source: 'starter-template', eventDriven: true },
    },
  ]),
  'Low',
  'risk-based',
  seededAt,
  seededAt,
);
insertStarter.run(
  'wf-safety-escalation',
  'Guest-room safety escalation',
  'Routes a reported safety concern to Engineering after manager approval.',
  'maintenance.safety-reported',
  '{}',
  JSON.stringify([
    {
      type: 'create_task',
      title: 'Safety inspection — room {{roomNumber}}',
      description: '{{note}}',
      department: 'Engineering',
      assignedTo: 'Engineering Lead Queue',
      priority: 'Urgent',
      roomNumber: '{{roomNumber}}',
      dueInMinutes: 15,
      metadata: { source: 'starter-template', safetyCritical: true },
    },
  ]),
  'Critical',
  'always',
  seededAt,
  seededAt,
);

// --------------------------------------------------------------- templates ----
r.get('/workflows/templates', operationalRoles, (req, res) => {
  const status = req.query.status;
  if (status != null && status !== 'all' && !TEMPLATE_STATUSES.has(status)) {
    throw httpError(400, 'status must be Active, Paused, Archived, or all');
  }
  const limit = listLimit(req.query.limit);
  const rows = status && status !== 'all'
    ? db.prepare(`
        SELECT wt.*,
          (SELECT COUNT(*) FROM workflow_runs wr WHERE wr.template_id = wt.id) AS run_count,
          (SELECT MAX(requested_at) FROM workflow_runs wr WHERE wr.template_id = wt.id) AS last_run_at
        FROM workflow_templates wt WHERE wt.status = ?
        ORDER BY wt.updated_at DESC LIMIT ?`).all(status, limit)
    : db.prepare(`
        SELECT wt.*,
          (SELECT COUNT(*) FROM workflow_runs wr WHERE wr.template_id = wt.id) AS run_count,
          (SELECT MAX(requested_at) FROM workflow_runs wr WHERE wr.template_id = wt.id) AS last_run_at
        FROM workflow_templates wt
        WHERE (? = 'all' OR wt.status != 'Archived')
        ORDER BY CASE wt.status WHEN 'Active' THEN 0 WHEN 'Paused' THEN 1 ELSE 2 END, wt.updated_at DESC
        LIMIT ?`).all(status || '', limit);
  res.json(rows.map(serializeTemplate));
});

r.get('/workflows/templates/:id', operationalRoles, (req, res) => {
  const row = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Workflow template not found' });
  res.json(serializeTemplate(row));
});

r.post('/workflows/templates', requireGeneralManager, (req, res) => {
  const input = normalizeTemplate(req.body);
  const id = uid('wf');
  const at = nowIso();
  const actor = actorFor(req);
  tx(() => {
    db.prepare(`
      INSERT INTO workflow_templates
        (id, name, description, trigger_type, trigger_config, actions, risk_level,
         approval_mode, status, version, created_by, created_at, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`)
      .run(
        id,
        input.name,
        input.description,
        input.triggerType,
        JSON.stringify(input.triggerConfig),
        JSON.stringify(input.actions),
        input.riskLevel,
        input.approvalMode,
        input.status,
        actor,
        at,
        actor,
        at,
      );
    audit('template', id, 'created', actor, { version: 1, riskLevel: input.riskLevel, status: input.status });
  });
  res.status(201).json(serializeTemplate(db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(id)));
});

r.patch('/workflows/templates/:id', requireGeneralManager, (req, res) => {
  const existing = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Workflow template not found' });
  if (req.body?.version != null
    && (!Number.isInteger(req.body.version) || req.body.version !== existing.version)) {
    return res.status(409).json({
      error: `Workflow version conflict: expected version ${existing.version}`,
      currentVersion: existing.version,
    });
  }
  const input = normalizeTemplate(req.body, existing);
  const actor = actorFor(req);
  const at = nowIso();
  const nextVersion = existing.version + 1;
  tx(() => {
    db.prepare(`
      UPDATE workflow_templates SET
        name = ?, description = ?, trigger_type = ?, trigger_config = ?, actions = ?,
        risk_level = ?, approval_mode = ?, status = ?, version = ?, updated_by = ?, updated_at = ?
      WHERE id = ?`)
      .run(
        input.name,
        input.description,
        input.triggerType,
        JSON.stringify(input.triggerConfig),
        JSON.stringify(input.actions),
        input.riskLevel,
        input.approvalMode,
        input.status,
        nextVersion,
        actor,
        at,
        existing.id,
      );
    audit('template', existing.id, 'updated', actor, {
      previousVersion: existing.version,
      version: nextVersion,
      riskLevel: input.riskLevel,
      status: input.status,
    });
  });
  res.json(serializeTemplate(db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(existing.id)));
});

r.delete('/workflows/templates/:id', requireGeneralManager, (req, res) => {
  const existing = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Workflow template not found' });
  if (existing.status !== 'Archived') {
    const actor = actorFor(req);
    tx(() => {
      db.prepare(`
        UPDATE workflow_templates
        SET status = 'Archived', version = version + 1, updated_by = ?, updated_at = ?
        WHERE id = ?`).run(actor, nowIso(), existing.id);
      audit('template', existing.id, 'archived', actor, { previousVersion: existing.version });
    });
  }
  res.status(204).end();
});

// -------------------------------------------------------------------- runs ----
r.get('/workflows/runs', operationalRoles, (req, res) => {
  const status = req.query.status;
  const allowedRunStatuses = new Set(['Awaiting Approval', 'Running', 'Completed', 'Rejected', 'Failed']);
  if (status != null && status !== 'all' && !allowedRunStatuses.has(status)) {
    throw httpError(400, 'Unknown workflow run status');
  }
  const limit = listLimit(req.query.limit, 50);
  const rows = status && status !== 'all'
    ? db.prepare(`
        SELECT wr.*, wt.name AS template_name,
          (SELECT COUNT(*) FROM workflow_tasks task WHERE task.run_id = wr.id) AS task_count
        FROM workflow_runs wr JOIN workflow_templates wt ON wt.id = wr.template_id
        WHERE wr.status = ? ORDER BY wr.requested_at DESC LIMIT ?`).all(status, limit)
    : db.prepare(`
        SELECT wr.*, wt.name AS template_name,
          (SELECT COUNT(*) FROM workflow_tasks task WHERE task.run_id = wr.id) AS task_count
        FROM workflow_runs wr JOIN workflow_templates wt ON wt.id = wr.template_id
        ORDER BY wr.requested_at DESC LIMIT ?`).all(limit);
  res.json(rows.map((row) => serializeRun(row)));
});

r.get('/workflows/runs/:id', operationalRoles, (req, res) => {
  const row = runById(req.params.id);
  if (!row) return res.status(404).json({ error: 'Workflow run not found' });
  res.json(serializeRun(row, { includeDetails: true }));
});

r.post('/workflows/templates/:id/run', operationalRoles, (req, res) => {
  const templateRow = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(req.params.id);
  if (!templateRow) return res.status(404).json({ error: 'Workflow template not found' });

  const key = normalizedText(req.body?.idempotencyKey, 'idempotencyKey', { required: true, max: 160 });
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(key)) {
    throw httpError(400, 'idempotencyKey must be 8–160 URL-safe characters');
  }
  const context = assertPlainObject(req.body?.context ?? {}, 'context');
  const actor = actorFor(req);
  const result = startWorkflowRun({ templateRow, key, context, actor });
  res.status(result.idempotentReplay ? 200 : result.approvalRequired ? 202 : 201)
    .json({ ...result.run, ...(result.idempotentReplay ? { idempotentReplay: true } : {}) });
});

r.post('/workflows/runs/:id/approve', requireGeneralManager, (req, res) => {
  const row = runById(req.params.id);
  if (!row) return res.status(404).json({ error: 'Workflow run not found' });
  if (row.status === 'Completed') {
    return res.json({ ...serializeRun(row, { includeDetails: true }), idempotentReplay: true });
  }
  if (row.status !== 'Awaiting Approval') {
    return res.status(409).json({ error: `Only Awaiting Approval runs can be approved; this run is ${row.status}` });
  }
  const actor = actorFor(req);
  const approvedAt = nowIso();
  const snapshot = parseJson(row.template_snapshot, null);
  const context = parseJson(row.context, {});
  if (!snapshot || !Array.isArray(snapshot.actions)) {
    throw httpError(500, 'The immutable workflow snapshot is unavailable');
  }
  tx(() => {
    db.prepare(`
      UPDATE workflow_runs
      SET status = 'Running', approved_by = ?, approved_at = ?
      WHERE id = ?`).run(actor, approvedAt, row.id);
    audit('run', row.id, 'approved', actor, { approvedAt, riskLevel: row.risk_level });
    executeRun(row.id, snapshot, context, actor, 'manager-approved');
  });
  res.json(serializeRun(runById(row.id), { includeDetails: true }));
});

r.post('/workflows/runs/:id/reject', requireGeneralManager, (req, res) => {
  const row = runById(req.params.id);
  if (!row) return res.status(404).json({ error: 'Workflow run not found' });
  if (row.status === 'Rejected') {
    return res.json({ ...serializeRun(row, { includeDetails: true }), idempotentReplay: true });
  }
  if (row.status !== 'Awaiting Approval') {
    return res.status(409).json({ error: `Only Awaiting Approval runs can be rejected; this run is ${row.status}` });
  }
  const reason = normalizedText(req.body?.reason, 'reason', { max: 500 });
  const actor = actorFor(req);
  const completedAt = nowIso();
  const priorOutput = parseJson(row.execution_output, {});
  const output = {
    ...priorOutput,
    decision: { ...(priorOutput.decision || {}), outcome: 'manager-rejected', reason },
    completedAt,
  };
  tx(() => {
    db.prepare(`
      UPDATE workflow_runs
      SET status = 'Rejected', execution_output = ?, approved_by = ?, approved_at = ?, completed_at = ?
      WHERE id = ?`).run(JSON.stringify(output), actor, completedAt, completedAt, row.id);
    audit('run', row.id, 'rejected', actor, { reason });
  });
  res.json(serializeRun(runById(row.id), { includeDetails: true }));
});

// ------------------------------------------------------------------- tasks ----
r.get('/workflows/tasks', operationalRoles, (req, res) => {
  const status = req.query.status;
  if (status != null && status !== 'all' && status !== 'active' && !TASK_STATUSES.has(status)) {
    throw httpError(400, 'Unknown task status');
  }
  const limit = listLimit(req.query.limit);
  let rows;
  if (status === 'active' || status == null) {
    rows = db.prepare(`
      SELECT * FROM workflow_tasks
      WHERE status NOT IN ('Completed', 'Cancelled')
      ORDER BY CASE priority WHEN 'Urgent' THEN 0 WHEN 'High' THEN 1 WHEN 'Normal' THEN 2 ELSE 3 END,
               CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at, created_at
      LIMIT ?`).all(limit);
  } else if (status === 'all') {
    rows = db.prepare('SELECT * FROM workflow_tasks ORDER BY created_at DESC LIMIT ?').all(limit);
  } else {
    rows = db.prepare('SELECT * FROM workflow_tasks WHERE status = ? ORDER BY created_at DESC LIMIT ?')
      .all(status, limit);
  }
  res.json(rows.map(serializeTask));
});

r.get('/workflows/tasks/:id', operationalRoles, (req, res) => {
  const row = db.prepare('SELECT * FROM workflow_tasks WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Operational task not found' });
  res.json(serializeTask(row));
});

r.post('/workflows/tasks', operationalRoles, (req, res) => {
  const input = taskPayload(req.body);
  const id = uid('wtask');
  const at = nowIso();
  const actor = actorFor(req);
  tx(() => {
    db.prepare(`
      INSERT INTO workflow_tasks
        (id, run_id, template_id, title, description, department, assigned_to,
         priority, status, room_number, due_at, completed_at, metadata,
         created_by, created_at, updated_by, updated_at)
      VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, 'Open', ?, ?, NULL, ?, ?, ?, ?, ?)`)
      .run(
        id,
        input.title,
        input.description,
        input.department,
        input.assignedTo,
        input.priority,
        input.roomNumber || null,
        input.dueAt ?? null,
        JSON.stringify(input.metadata),
        actor,
        at,
        actor,
        at,
      );
    audit('task', id, 'created_manually', actor, { department: input.department, priority: input.priority });
  });
  res.status(201).json(serializeTask(db.prepare('SELECT * FROM workflow_tasks WHERE id = ?').get(id)));
});

r.patch('/workflows/tasks/:id', operationalRoles, (req, res) => {
  const existing = db.prepare('SELECT * FROM workflow_tasks WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Operational task not found' });
  if (TERMINAL_TASK_STATUSES.has(existing.status)) {
    return res.status(409).json({ error: `${existing.status} tasks are immutable` });
  }
  const input = taskPayload(req.body, { partial: true });
  if (Object.keys(input).length === 0) throw httpError(400, 'At least one task field is required');
  const nextStatus = input.status ?? existing.status;
  const at = nowIso();
  const actor = actorFor(req);
  const completedAt = nextStatus === 'Completed' ? at : null;
  tx(() => {
    db.prepare(`
      UPDATE workflow_tasks SET
        title = ?, description = ?, department = ?, assigned_to = ?, priority = ?, status = ?,
        room_number = ?, due_at = ?, completed_at = ?, metadata = ?, updated_by = ?, updated_at = ?
      WHERE id = ?`)
      .run(
        input.title ?? existing.title,
        input.description ?? existing.description,
        input.department ?? existing.department,
        input.assignedTo ?? existing.assigned_to,
        input.priority ?? existing.priority,
        nextStatus,
        input.roomNumber === undefined ? existing.room_number : (input.roomNumber || null),
        input.dueAt === undefined ? existing.due_at : input.dueAt,
        completedAt,
        input.metadata === undefined ? existing.metadata : JSON.stringify(input.metadata),
        actor,
        at,
        existing.id,
      );
    audit('task', existing.id, 'updated', actor, {
      previousStatus: existing.status,
      status: nextStatus,
      changedFields: Object.keys(input),
    });
  });
  res.json(serializeTask(db.prepare('SELECT * FROM workflow_tasks WHERE id = ?').get(existing.id)));
});

r.delete('/workflows/tasks/:id', operationalRoles, (req, res) => {
  const existing = db.prepare('SELECT * FROM workflow_tasks WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Operational task not found' });
  if (!TERMINAL_TASK_STATUSES.has(existing.status)) {
    const actor = actorFor(req);
    const at = nowIso();
    tx(() => {
      db.prepare(`
        UPDATE workflow_tasks
        SET status = 'Cancelled', completed_at = NULL, updated_by = ?, updated_at = ?
        WHERE id = ?`).run(actor, at, existing.id);
      audit('task', existing.id, 'cancelled', actor, { previousStatus: existing.status });
    });
  }
  res.status(204).end();
});

// --------------------------------------------------------- durable events ----
r.get('/workflows/events', requireGeneralManager, (req, res) => {
  const status = req.query.status;
  const allowed = new Set(['Pending', 'Processing', 'Completed', 'Failed']);
  if (status != null && status !== 'all' && !allowed.has(status)) {
    throw httpError(400, 'Unknown workflow event status');
  }
  const limit = listLimit(req.query.limit, 50);
  const rows = status && status !== 'all'
    ? db.prepare(`
        SELECT * FROM workflow_event_outbox
        WHERE status = ? ORDER BY created_at DESC, id DESC LIMIT ?
      `).all(status, limit)
    : db.prepare(`
        SELECT * FROM workflow_event_outbox
        ORDER BY created_at DESC, id DESC LIMIT ?
      `).all(limit);
  res.json(rows.map((row) => ({
    id: row.id,
    eventKey: row.event_key,
    eventType: row.event_type,
    aggregateId: row.aggregate_id,
    eventVersion: row.event_version,
    context: parseJson(row.context, {}),
    actor: row.actor,
    status: row.status,
    attemptCount: Number(row.attempt_count),
    availableAt: row.available_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  })));
});

r.post('/workflows/events/process', requireGeneralManager, (req, res) => {
  const rawLimit = req.body?.limit ?? 25;
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100) {
    throw httpError(400, 'limit must be an integer from 1 to 100');
  }
  res.json(processWorkflowEventOutbox({ limit: rawLimit }));
});

// --------------------------------------------------------------- audit feed ----
r.get('/workflows/audit', operationalRoles, (req, res) => {
  const limit = listLimit(req.query.limit, 50);
  const entityType = req.query.entityType;
  if (entityType != null && !['template', 'run', 'task'].includes(entityType)) {
    throw httpError(400, 'entityType must be template, run, or task');
  }
  const rows = entityType
    ? db.prepare(`
        SELECT * FROM workflow_audit_events
        WHERE entity_type = ? ORDER BY created_at DESC, id DESC LIMIT ?`).all(entityType, limit)
    : db.prepare('SELECT * FROM workflow_audit_events ORDER BY created_at DESC, id DESC LIMIT ?').all(limit);
  res.json(rows.map(serializeAuditEvent));
});

export default r;
