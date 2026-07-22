// Versioned API discovery and developer-readiness endpoints.
// Mount at /api before the global requireAuth middleware: this router keeps
// /openapi.json public and applies requireAuth to its developer endpoints.
import { Router } from 'express';
import { db, today } from '../db.js';
import {
  requireAuth,
  requirePasswordChangeComplete,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from '../auth.js';
import { createApiRateLimiter, grantedScopesFor } from '../security.js';

const r = Router();
const developerRateLimit = createApiRateLimiter({ database: db });
const API_CONTRACT_VERSION = '1.0.0';
const AUTH_SECURITY = [{ SessionCookie: [] }, { BearerAuth: [] }];
const ALL_OPERATIONAL_ROLES = ['General Manager', 'Front Desk', 'Housekeeping', 'Finance'];

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const responseRef = (name) => ({ $ref: `#/components/responses/${name}` });
const jsonContent = (schema, example) => ({
  'application/json': {
    schema,
    ...(example === undefined ? {} : { example }),
  },
});
const jsonResponse = (description, schema, example, extra = {}) => ({
  description,
  ...(schema ? { content: jsonContent(schema, example) } : {}),
  ...extra,
});
const jsonBody = (schema, description, required = true) => ({
  required,
  ...(description ? { description } : {}),
  content: jsonContent(schema),
});
const standardErrors = (...names) => Object.fromEntries(names.map((name) => {
  const statuses = {
    BadRequest: '400', Unauthorized: '401', Forbidden: '403', NotFound: '404',
    Conflict: '409', TooManyRequests: '429', ServiceUnavailable: '503',
  };
  return [statuses[name], responseRef(name)];
}));
const idParameter = (description) => ({
  name: 'id',
  in: 'path',
  required: true,
  description,
  schema: { type: 'string', minLength: 1, maxLength: 200 },
});
const limitParameter = {
  name: 'limit',
  in: 'query',
  required: false,
  description: 'Maximum records to return.',
  schema: { type: 'integer', minimum: 1, maximum: 200 },
};
const secured = (operation, { roles, scopes } = {}) => ({
  ...operation,
  security: AUTH_SECURITY,
  ...(roles ? { 'x-required-roles': roles } : {}),
  ...(scopes ? { 'x-required-scopes': scopes } : {}),
});

const OUTBOUND_EVENTS = Object.freeze([
  {
    type: 'reservation.created',
    description: 'A staff or public direct-booking flow committed a confirmed reservation.',
    emittedBy: ['POST /reservations', 'POST /booking/reservations'],
    payload: {
      required: ['reservationId', 'code', 'status', 'channel', 'roomType', 'checkIn', 'checkOut', 'nights', 'guests', 'grandTotal'],
      optional: ['currency'],
    },
  },
  {
    type: 'maintenance.created',
    description: 'An operational maintenance order was committed.',
    emittedBy: ['POST /maintenance'],
    payload: {
      required: ['id', 'roomNumber', 'category', 'priority', 'status', 'safetyCritical'],
      optional: [],
    },
  },
  {
    type: 'group.created',
    description: 'A group room block was committed for an accessible property.',
    emittedBy: ['POST /groups'],
    payload: {
      required: ['id', 'propertyId', 'groupName', 'companyName', 'roomsAllocated', 'startDate', 'endDate', 'releaseDate', 'status', 'totalValue'],
      optional: [],
    },
  },
  {
    type: 'reputation.response_approved',
    description: 'A review response was saved in NexusHOS. External publication remains connector-dependent.',
    emittedBy: ['POST /reputation/reviews/{id}/respond'],
    payload: {
      required: ['reviewId', 'propertyId', 'source', 'respondedAt'],
      optional: [],
    },
  },
  {
    type: 'esg.action_requested',
    description: 'An HVAC setback request was recorded. Device execution requires a building-management connector.',
    emittedBy: ['POST /esg/actions/hvac-setback'],
    payload: {
      required: ['id', 'propertyId', 'actionType', 'target', 'status', 'requestedAt'],
      optional: [],
    },
  },
  {
    type: 'platform.webhook.test',
    description: 'A privileged operator requested a test delivery for one active subscription.',
    emittedBy: ['POST /platform/webhooks/{id}/test'],
    payload: {
      required: ['message', 'requestedBy', 'requestedAt'],
      optional: [],
    },
  },
]);

const WORKFLOW_EVENT_TRIGGERS = Object.freeze([
  {
    type: 'reservation.created',
    description: 'Starts matching active workflow templates after a reservation commits.',
    dispatchedBy: ['POST /reservations', 'POST /booking/reservations'],
    contextFields: ['confirmationCode', 'guestName', 'roomNumber', 'roomType', 'checkIn', 'checkOut', 'channel'],
  },
  {
    type: 'maintenance.safety-reported',
    description: 'Starts matching active workflow templates for safety-critical maintenance orders.',
    dispatchedBy: ['POST /maintenance when safetyCritical is true'],
    contextFields: ['roomNumber', 'note', 'category', 'priority'],
  },
]);

const EVENT_CATALOG = Object.freeze({
  catalogVersion: API_CONTRACT_VERSION,
  transport: {
    protocol: 'HTTPS POST',
    contentType: 'application/json',
    envelope: {
      fields: ['id', 'type', 'occurredAt', 'data'],
      payloadVersionField: false,
    },
    headers: [
      'X-Nexus-Event',
      'X-Nexus-Event-ID',
      'X-Nexus-Delivery-ID',
      'X-Nexus-Timestamp',
      'X-Nexus-Signature',
    ],
    signature: {
      version: 'v1',
      algorithm: 'HMAC-SHA256',
      signedInput: '{timestamp}.{deliveryId}.{rawRequestBody}',
      headerFormat: 'v1={hexDigest}',
      recommendedToleranceSeconds: 300,
    },
    retryPolicy: {
      successStatuses: '200-299',
      defaultMaximumAttempts: 6,
      initialDelaySeconds: 30,
      strategy: 'exponential backoff capped at one hour',
    },
    currentDeliveryMode: 'Operator-triggered drain endpoint; production should run a dedicated worker.',
  },
  outboundEvents: OUTBOUND_EVENTS,
  workflowEventTriggers: WORKFLOW_EVENT_TRIGGERS,
});

const schemas = {
  Error: {
    type: 'object',
    required: ['error'],
    properties: {
      error: { type: 'string' },
      requestId: { type: 'string', format: 'uuid' },
      retryAfterSeconds: { type: 'integer', minimum: 1 },
      currentVersion: { type: 'integer', minimum: 1 },
    },
    additionalProperties: true,
  },
  Health: {
    type: 'object',
    required: ['status', 'database'],
    properties: {
      status: { type: 'string', enum: ['ok', 'error'] },
      database: { type: 'string', enum: ['ok', 'unavailable'] },
      timestamp: {
        type: 'string',
        format: 'date-time',
        description: 'Present on successful readiness responses.',
      },
    },
  },
  AuthUser: {
    type: 'object',
    required: ['name', 'role', 'email'],
    properties: {
      name: { type: 'string' },
      role: { type: 'string', enum: ALL_OPERATIONAL_ROLES },
      email: { type: 'string', format: 'email' },
      mustChangePassword: { type: 'boolean' },
    },
  },
  LoginRequest: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', format: 'password', minLength: 1 },
    },
    additionalProperties: false,
  },
  LoginResponse: {
    type: 'object',
    required: ['token', 'expiresAt', 'user'],
    properties: {
      token: { type: 'string', description: 'Opaque bearer token for CLI and integration clients.' },
      expiresAt: { type: 'string', format: 'date-time' },
      user: ref('AuthUser'),
    },
  },
  SessionResponse: {
    type: 'object',
    required: ['user'],
    properties: { user: ref('AuthUser') },
  },
  PublicRoomType: {
    type: 'object',
    required: ['roomType', 'description', 'maxGuests', 'availableCount', 'nightlyRate', 'currency', 'amenities'],
    properties: {
      roomType: { type: 'string' },
      description: { type: 'string' },
      maxGuests: { type: 'integer', minimum: 1, maximum: 6 },
      availableCount: { type: 'integer', minimum: 1 },
      nightlyRate: { type: 'number', minimum: 0 },
      currency: { type: 'string', pattern: '^[A-Z]{3}$' },
      amenities: { type: 'array', items: { type: 'string' } },
    },
  },
  AvailabilityResponse: {
    type: 'object',
    required: ['checkIn', 'checkOut', 'nights', 'guests', 'businessDate', 'currency', 'roomTypes'],
    properties: {
      checkIn: { type: 'string', format: 'date' },
      checkOut: { type: 'string', format: 'date' },
      nights: { type: 'integer', minimum: 1, maximum: 30 },
      guests: { type: 'integer', minimum: 1, maximum: 6 },
      businessDate: { type: 'string', format: 'date' },
      currency: { type: 'string', pattern: '^[A-Z]{3}$' },
      roomTypes: { type: 'array', items: ref('PublicRoomType') },
    },
  },
  QuoteRequest: {
    type: 'object',
    required: ['checkIn', 'checkOut', 'guests', 'roomType'],
    properties: {
      checkIn: { type: 'string', format: 'date' },
      checkOut: { type: 'string', format: 'date' },
      guests: { type: 'integer', minimum: 1, maximum: 6 },
      roomType: { type: 'string', maxLength: 80 },
    },
    additionalProperties: false,
  },
  BookingQuote: {
    type: 'object',
    required: ['quoteId', 'checkIn', 'checkOut', 'nights', 'guests', 'roomType', 'nightlyRate', 'roomTotal', 'taxRate', 'taxAmount', 'grandTotal', 'currency', 'expiresAt', 'ratePlan', 'paymentDueNow', 'cancellationPolicy'],
    properties: {
      quoteId: { type: 'string' },
      checkIn: { type: 'string', format: 'date' },
      checkOut: { type: 'string', format: 'date' },
      nights: { type: 'integer', minimum: 1, maximum: 30 },
      guests: { type: 'integer', minimum: 1, maximum: 6 },
      roomType: { type: 'string' },
      nightlyRate: { type: 'number', minimum: 0 },
      roomTotal: { type: 'number', minimum: 0 },
      taxRate: { type: 'number', minimum: 0, maximum: 1 },
      taxAmount: { type: 'number', minimum: 0 },
      grandTotal: { type: 'number', minimum: 0 },
      currency: { type: 'string', pattern: '^[A-Z]{3}$' },
      expiresAt: { type: 'string', format: 'date-time' },
      ratePlan: { type: 'string' },
      paymentDueNow: { type: 'number', minimum: 0 },
      cancellationPolicy: { type: 'string' },
    },
  },
  BookingGuest: {
    type: 'object',
    required: ['firstName', 'lastName', 'email'],
    properties: {
      firstName: { type: 'string', minLength: 1, maxLength: 80 },
      lastName: { type: 'string', minLength: 1, maxLength: 80 },
      email: { type: 'string', format: 'email', maxLength: 254 },
      phone: { type: 'string', maxLength: 40 },
    },
    additionalProperties: false,
  },
  BookingCreateRequest: {
    type: 'object',
    required: ['quoteId', 'guest', 'termsAccepted'],
    properties: {
      quoteId: { type: 'string', maxLength: 100 },
      guest: ref('BookingGuest'),
      specialRequests: { type: 'string', maxLength: 500 },
      termsAccepted: { const: true },
    },
    additionalProperties: false,
  },
  BookingConfirmation: {
    type: 'object',
    required: ['reservationId', 'code', 'status', 'guestName', 'guestEmail', 'roomType', 'checkIn', 'checkOut', 'nights', 'guests', 'roomTotal', 'taxAmount', 'grandTotal', 'currency', 'paymentDueNow', 'cancellationPolicy'],
    properties: {
      reservationId: { type: 'string' },
      code: { type: 'string' },
      status: { const: 'Confirmed' },
      guestName: { type: 'string' },
      guestEmail: { type: 'string', format: 'email' },
      roomType: { type: 'string' },
      checkIn: { type: 'string', format: 'date' },
      checkOut: { type: 'string', format: 'date' },
      nights: { type: 'integer' },
      guests: { type: 'integer' },
      roomTotal: { type: 'number' },
      taxAmount: { type: 'number' },
      grandTotal: { type: 'number' },
      currency: { type: 'string' },
      paymentDueNow: { type: 'number' },
      cancellationPolicy: { type: 'string' },
    },
  },
  DeveloperStatus: {
    type: 'object',
    required: ['contractVersion', 'generatedAt', 'businessDate', 'environment', 'actor', 'authentication', 'database', 'openApi', 'webhooks', 'workflows', 'audit', 'http', 'limitations'],
    properties: {
      contractVersion: { type: 'string' },
      generatedAt: { type: 'string', format: 'date-time' },
      businessDate: { type: 'string', format: 'date' },
      environment: { type: 'string' },
      actor: { type: 'object', additionalProperties: true },
      authentication: { type: 'object', additionalProperties: true },
      database: { type: 'object', additionalProperties: true },
      openApi: { type: 'object', additionalProperties: true },
      webhooks: { type: 'object', additionalProperties: true },
      workflows: { type: 'object', additionalProperties: true },
      audit: { type: 'object', additionalProperties: true },
      http: { type: 'object', additionalProperties: true },
      limitations: { type: 'array', items: { type: 'string' } },
    },
  },
  EventCatalog: {
    type: 'object',
    required: ['catalogVersion', 'generatedAt', 'transport', 'outboundEvents', 'workflowEventTriggers'],
    properties: {
      catalogVersion: { type: 'string' },
      generatedAt: { type: 'string', format: 'date-time' },
      transport: { type: 'object', additionalProperties: true },
      outboundEvents: { type: 'array', items: { type: 'object', additionalProperties: true } },
      workflowEventTriggers: { type: 'array', items: { type: 'object', additionalProperties: true } },
    },
  },
  WebhookSubscription: {
    type: 'object',
    required: ['id', 'url', 'eventTypes', 'active', 'createdBy', 'createdAt', 'updatedAt'],
    properties: {
      id: { type: 'string' },
      url: { type: 'string', format: 'uri' },
      description: { type: ['string', 'null'] },
      eventTypes: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'string' } },
      active: { type: 'boolean' },
      createdBy: { type: 'string' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  WebhookCreateRequest: {
    type: 'object',
    required: ['url', 'eventTypes'],
    properties: {
      url: { type: 'string', format: 'uri', description: 'HTTPS URL; local/private targets are rejected by default.' },
      description: { type: 'string', minLength: 1, maxLength: 500 },
      eventTypes: { type: 'array', minItems: 1, maxItems: 100, uniqueItems: true, items: { type: 'string' } },
    },
    additionalProperties: false,
  },
  WebhookCreateResult: {
    type: 'object',
    required: ['subscription', 'signingSecret'],
    properties: {
      subscription: ref('WebhookSubscription'),
      signingSecret: { type: 'string', pattern: '^whsec_', description: 'Returned once. Store securely.' },
    },
  },
  WebhookUpdateRequest: {
    type: 'object',
    minProperties: 1,
    properties: {
      url: { type: 'string', format: 'uri' },
      description: { type: ['string', 'null'], maxLength: 500 },
      eventTypes: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'string' } },
      active: { type: 'boolean' },
      rotateSecret: { type: 'boolean' },
    },
    additionalProperties: false,
  },
  WebhookUpdateResult: {
    type: 'object',
    required: ['subscription'],
    properties: {
      subscription: ref('WebhookSubscription'),
      signingSecret: { type: 'string', pattern: '^whsec_', description: 'Only returned when rotateSecret is true.' },
    },
  },
  QueuedWebhookEvent: {
    type: 'object',
    required: ['id', 'eventType', 'occurredAt', 'queued'],
    properties: {
      id: { type: 'string' },
      eventType: { type: 'string' },
      occurredAt: { type: 'string', format: 'date-time' },
      queued: { type: 'integer', minimum: 0 },
    },
  },
  WebhookDeliveryAttempt: {
    type: 'object',
    required: ['id', 'eventId', 'eventType', 'subscriptionId', 'subscriptionUrl', 'attemptNumber', 'status', 'scheduledAt', 'createdAt'],
    properties: {
      id: { type: 'string' },
      eventId: { type: 'string' },
      eventType: { type: 'string' },
      subscriptionId: { type: 'string' },
      subscriptionUrl: { type: 'string', format: 'uri' },
      attemptNumber: { type: 'integer', minimum: 1 },
      status: { type: 'string', enum: ['Pending', 'Delivering', 'Succeeded', 'Failed'] },
      scheduledAt: { type: 'string', format: 'date-time' },
      startedAt: { type: ['string', 'null'], format: 'date-time' },
      completedAt: { type: ['string', 'null'], format: 'date-time' },
      responseStatus: { type: ['integer', 'null'] },
      responseBody: { type: ['string', 'null'] },
      error: { type: ['string', 'null'] },
      signatureVersion: { type: ['string', 'null'] },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  WebhookDeliverySummary: {
    type: 'object',
    required: ['claimed', 'succeeded', 'failed', 'retried'],
    properties: {
      claimed: { type: 'integer', minimum: 0 },
      succeeded: { type: 'integer', minimum: 0 },
      failed: { type: 'integer', minimum: 0 },
      retried: { type: 'integer', minimum: 0 },
    },
  },
  PlatformAuditEvent: {
    type: 'object',
    required: ['sequence', 'id', 'occurredAt', 'action', 'resourceType', 'outcome', 'source', 'eventHash'],
    properties: {
      sequence: { type: 'integer', minimum: 1 },
      id: { type: 'string' },
      occurredAt: { type: 'string', format: 'date-time' },
      requestId: { type: ['string', 'null'] },
      actorId: { type: ['string', 'null'] },
      actorRole: { type: ['string', 'null'] },
      action: { type: 'string' },
      resourceType: { type: 'string' },
      resourceId: { type: ['string', 'null'] },
      outcome: { type: 'string' },
      source: { type: 'string' },
      networkHash: { type: ['string', 'null'] },
      metadata: { type: ['object', 'null'], additionalProperties: true },
      previousHash: { type: ['string', 'null'] },
      eventHash: { type: 'string' },
    },
  },
  AuditPage: {
    type: 'object',
    required: ['events', 'nextBeforeSequence'],
    properties: {
      events: { type: 'array', items: ref('PlatformAuditEvent') },
      nextBeforeSequence: { type: ['integer', 'null'] },
    },
  },
  AuditVerification: {
    type: 'object',
    required: ['valid', 'checked'],
    properties: {
      valid: { type: 'boolean' },
      checked: { type: 'integer', minimum: 0 },
      firstInvalidSequence: { type: 'integer', minimum: 1 },
      reason: { type: 'string' },
      lastSequence: { type: ['integer', 'null'] },
      lastHash: { type: ['string', 'null'] },
    },
  },
  WorkflowCreateTaskAction: {
    type: 'object',
    required: ['type', 'title', 'department'],
    properties: {
      type: { const: 'create_task' },
      title: { type: 'string', minLength: 1, maxLength: 140 },
      description: { type: 'string', maxLength: 1200 },
      department: { type: 'string', minLength: 1, maxLength: 80 },
      assignedTo: { type: 'string', maxLength: 120 },
      priority: { type: 'string', enum: ['Low', 'Normal', 'High', 'Urgent'] },
      roomNumber: { type: 'string', maxLength: 40 },
      dueInMinutes: { type: 'integer', minimum: 0, maximum: 43200 },
      metadata: { type: 'object', additionalProperties: true },
    },
  },
  WorkflowAuditNoteAction: {
    type: 'object',
    required: ['type', 'message'],
    properties: {
      type: { const: 'audit_note' },
      message: { type: 'string', minLength: 1, maxLength: 1000 },
    },
  },
  WorkflowAction: {
    oneOf: [ref('WorkflowCreateTaskAction'), ref('WorkflowAuditNoteAction')],
    discriminator: { propertyName: 'type' },
  },
  WorkflowTemplateInput: {
    type: 'object',
    required: ['name', 'actions'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 100 },
      description: { type: 'string', maxLength: 700 },
      triggerType: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9._-]*$' },
      triggerConfig: { type: 'object', additionalProperties: true },
      actions: { type: 'array', minItems: 1, maxItems: 20, items: ref('WorkflowAction') },
      riskLevel: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
      approvalMode: { type: 'string', enum: ['risk-based', 'always', 'never'] },
      status: { type: 'string', enum: ['Active', 'Paused', 'Archived'] },
    },
  },
  WorkflowTemplatePatch: {
    type: 'object',
    minProperties: 1,
    properties: {
      version: { type: 'integer', minimum: 1, description: 'Optional optimistic-concurrency version.' },
      name: { type: 'string', minLength: 1, maxLength: 100 },
      description: { type: 'string', maxLength: 700 },
      triggerType: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9._-]*$' },
      triggerConfig: { type: 'object', additionalProperties: true },
      actions: { type: 'array', minItems: 1, maxItems: 20, items: ref('WorkflowAction') },
      riskLevel: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
      approvalMode: { type: 'string', enum: ['risk-based', 'always', 'never'] },
      status: { type: 'string', enum: ['Active', 'Paused', 'Archived'] },
    },
  },
  WorkflowTemplate: {
    allOf: [
      ref('WorkflowTemplateInput'),
      {
        type: 'object',
        required: ['id', 'triggerType', 'triggerConfig', 'riskLevel', 'approvalMode', 'status', 'version', 'createdBy', 'createdAt', 'updatedBy', 'updatedAt'],
        properties: {
          id: { type: 'string' },
          version: { type: 'integer', minimum: 1 },
          createdBy: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedBy: { type: 'string' },
          updatedAt: { type: 'string', format: 'date-time' },
          runCount: { type: 'integer', minimum: 0 },
          lastRunAt: { type: ['string', 'null'], format: 'date-time' },
        },
      },
    ],
  },
  WorkflowRunRequest: {
    type: 'object',
    required: ['idempotencyKey'],
    properties: {
      idempotencyKey: { type: 'string', minLength: 8, maxLength: 160, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]+$' },
      context: { type: 'object', additionalProperties: true },
    },
    additionalProperties: false,
  },
  WorkflowRun: {
    type: 'object',
    required: ['id', 'templateId', 'templateName', 'templateVersion', 'idempotencyKey', 'status', 'riskLevel', 'approvalRequired', 'context', 'executionOutput', 'requestedBy', 'requestedAt'],
    properties: {
      id: { type: 'string' },
      templateId: { type: 'string' },
      templateName: { type: 'string' },
      templateVersion: { type: 'integer' },
      idempotencyKey: { type: 'string' },
      status: { type: 'string', enum: ['Awaiting Approval', 'Running', 'Completed', 'Rejected', 'Failed'] },
      riskLevel: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
      approvalRequired: { type: 'boolean' },
      context: { type: 'object', additionalProperties: true },
      executionOutput: { type: 'object', additionalProperties: true },
      requestedBy: { type: 'string' },
      requestedAt: { type: 'string', format: 'date-time' },
      approvedBy: { type: ['string', 'null'] },
      approvedAt: { type: ['string', 'null'], format: 'date-time' },
      completedAt: { type: ['string', 'null'], format: 'date-time' },
      taskCount: { type: 'integer', minimum: 0 },
      templateSnapshot: { type: 'object', additionalProperties: true },
      tasks: { type: 'array', items: ref('WorkflowTask') },
      audit: { type: 'array', items: ref('WorkflowAuditEvent') },
      idempotentReplay: { type: 'boolean' },
    },
  },
  WorkflowTaskInput: {
    type: 'object',
    required: ['title', 'department'],
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 140 },
      description: { type: 'string', maxLength: 1200 },
      department: { type: 'string', minLength: 1, maxLength: 80 },
      assignedTo: { type: 'string', maxLength: 120 },
      priority: { type: 'string', enum: ['Low', 'Normal', 'High', 'Urgent'] },
      roomNumber: { type: 'string', maxLength: 40 },
      dueAt: { type: ['string', 'null'], format: 'date-time' },
      metadata: { type: 'object', additionalProperties: true },
    },
  },
  WorkflowTaskPatch: {
    type: 'object',
    minProperties: 1,
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 140 },
      description: { type: 'string', maxLength: 1200 },
      department: { type: 'string', minLength: 1, maxLength: 80 },
      assignedTo: { type: 'string', maxLength: 120 },
      priority: { type: 'string', enum: ['Low', 'Normal', 'High', 'Urgent'] },
      status: { type: 'string', enum: ['Open', 'In Progress', 'Blocked', 'Completed', 'Cancelled'] },
      roomNumber: { type: 'string', maxLength: 40 },
      dueAt: { type: ['string', 'null'], format: 'date-time' },
      metadata: { type: 'object', additionalProperties: true },
    },
  },
  WorkflowTask: {
    allOf: [
      ref('WorkflowTaskInput'),
      {
        type: 'object',
        required: ['id', 'status', 'createdBy', 'createdAt', 'updatedBy', 'updatedAt'],
        properties: {
          id: { type: 'string' },
          runId: { type: ['string', 'null'] },
          templateId: { type: ['string', 'null'] },
          status: { type: 'string', enum: ['Open', 'In Progress', 'Blocked', 'Completed', 'Cancelled'] },
          completedAt: { type: ['string', 'null'], format: 'date-time' },
          createdBy: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedBy: { type: 'string' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
    ],
  },
  WorkflowAuditEvent: {
    type: 'object',
    required: ['id', 'entityType', 'entityId', 'action', 'actor', 'details', 'createdAt'],
    properties: {
      id: { type: 'string' },
      entityType: { type: 'string', enum: ['template', 'run', 'task'] },
      entityId: { type: 'string' },
      action: { type: 'string' },
      actor: { type: 'string' },
      details: { type: 'object', additionalProperties: true },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
};

const responses = {
  BadRequest: jsonResponse('Request validation failed.', ref('Error')),
  Unauthorized: jsonResponse('Authentication is missing, invalid, or expired.', ref('Error')),
  Forbidden: jsonResponse('The authenticated principal lacks the required role or platform scope.', ref('Error')),
  NotFound: jsonResponse('The requested resource does not exist or is not visible to the principal.', ref('Error')),
  Conflict: jsonResponse('The request conflicts with current resource, inventory, quote, or idempotency state.', ref('Error')),
  TooManyRequests: jsonResponse('A request-rate limit was exceeded.', ref('Error'), undefined, {
    headers: {
      'Retry-After': { description: 'Seconds until the current rate-limit window resets.', schema: { type: 'integer', minimum: 1 } },
    },
  }),
  ServiceUnavailable: jsonResponse('A required platform secret or dependency is unavailable.', ref('Error')),
};

const paths = {
  '/health': {
    get: {
      tags: ['Public'],
      summary: 'Check API and database readiness',
      operationId: 'getHealth',
      security: [],
      responses: {
        200: jsonResponse('API and database are ready.', ref('Health')),
        503: jsonResponse('Database is unavailable.', ref('Health')),
      },
    },
  },
  '/auth/login': {
    post: {
      tags: ['Authentication'],
      summary: 'Create a 12-hour session',
      description: 'Sets the HttpOnly session cookie and also returns an opaque bearer token for non-browser clients.',
      operationId: 'login',
      security: [],
      requestBody: jsonBody(ref('LoginRequest')),
      responses: {
        200: jsonResponse('Session created.', ref('LoginResponse'), undefined, {
          headers: {
            'Set-Cookie': { description: `${SESSION_COOKIE} HttpOnly session cookie.`, schema: { type: 'string' } },
          },
        }),
        ...standardErrors('BadRequest', 'Unauthorized', 'TooManyRequests'),
      },
    },
  },
  '/auth/session': {
    get: secured({
      tags: ['Authentication'],
      summary: 'Read the current session principal',
      operationId: 'getCurrentSession',
      responses: {
        200: jsonResponse('Current user.', ref('SessionResponse')),
        ...standardErrors('Unauthorized'),
      },
    }),
  },
  '/auth/logout': {
    post: secured({
      tags: ['Authentication'],
      summary: 'Revoke the current session',
      operationId: 'logout',
      responses: {
        204: { description: 'Session revoked and cookie cleared.' },
        ...standardErrors('Unauthorized'),
      },
    }),
  },
  '/booking/availability': {
    get: {
      tags: ['Public Booking'],
      summary: 'Search public room-type availability',
      operationId: 'searchBookingAvailability',
      security: [],
      parameters: [
        { name: 'checkIn', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
        { name: 'checkOut', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
        { name: 'guests', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 6, default: 1 } },
      ],
      responses: {
        200: jsonResponse('Available room types; physical room numbers are intentionally not exposed.', ref('AvailabilityResponse')),
        ...standardErrors('BadRequest', 'TooManyRequests'),
      },
    },
  },
  '/booking/quote': {
    post: {
      tags: ['Public Booking'],
      summary: 'Create a server-authoritative booking quote',
      description: 'Persists a price for 15 minutes. A quote does not hold inventory; creation rechecks availability transactionally.',
      operationId: 'createBookingQuote',
      security: [],
      requestBody: jsonBody(ref('QuoteRequest')),
      responses: {
        201: jsonResponse('Quote created.', ref('BookingQuote')),
        ...standardErrors('BadRequest', 'Conflict', 'TooManyRequests'),
      },
    },
  },
  '/booking/reservations': {
    post: {
      tags: ['Public Booking'],
      summary: 'Confirm a quoted direct booking',
      description: 'Creates a pay-at-property reservation. Prices and tax are taken only from the persisted quote.',
      operationId: 'createDirectBooking',
      security: [],
      parameters: [{
        name: 'Idempotency-Key',
        in: 'header',
        required: true,
        description: 'Stable per booking attempt. Reuse with the same normalized request safely replays the original 201 response; a changed request returns 409.',
        schema: { type: 'string', minLength: 8, maxLength: 128, pattern: '^[A-Za-z0-9._:-]+$' },
      }],
      requestBody: jsonBody(ref('BookingCreateRequest')),
      responses: {
        201: jsonResponse('Reservation created or safely replayed.', ref('BookingConfirmation'), undefined, {
          headers: {
            'Idempotent-Replay': { description: 'Present with value true only for a replay.', schema: { type: 'string', const: 'true' } },
          },
        }),
        ...standardErrors('BadRequest', 'NotFound', 'Conflict', 'TooManyRequests'),
      },
    },
  },
  '/openapi.json': {
    get: {
      tags: ['Developer'],
      summary: 'Download the current OpenAPI contract',
      operationId: 'getOpenApiDocument',
      security: [],
      responses: {
        200: {
          description: 'OpenAPI 3.1 JSON document.',
          content: {
            'application/vnd.oai.openapi+json': {
              schema: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
  },
  '/developer/status': {
    get: secured({
      tags: ['Developer'],
      summary: 'Inspect API and integration readiness',
      operationId: 'getDeveloperStatus',
      responses: {
        200: jsonResponse('Authenticated readiness report.', ref('DeveloperStatus')),
        ...standardErrors('Unauthorized'),
      },
    }),
  },
  '/developer/events/catalog': {
    get: secured({
      tags: ['Developer'],
      summary: 'List implemented webhook and workflow event contracts',
      operationId: 'getEventCatalog',
      responses: {
        200: jsonResponse('Current emitted event catalog and signature contract.', ref('EventCatalog')),
        ...standardErrors('Unauthorized'),
      },
    }),
  },
  '/platform/audit-events': {
    get: secured({
      tags: ['Platform Audit'],
      summary: 'Query immutable platform audit events',
      operationId: 'listPlatformAuditEvents',
      parameters: [
        limitParameter,
        { name: 'beforeSequence', in: 'query', schema: { type: 'integer', minimum: 1 } },
        ...['action', 'resourceType', 'resourceId', 'actorId', 'outcome'].map((name) => ({ name, in: 'query', schema: { type: 'string' } })),
        { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
        { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
      ],
      responses: {
        200: jsonResponse('Audit page ordered by descending sequence.', ref('AuditPage')),
        ...standardErrors('BadRequest', 'Unauthorized', 'Forbidden'),
      },
    }, { scopes: ['platform:audit:read'] }),
  },
  '/platform/audit-events/verify': {
    get: secured({
      tags: ['Platform Audit'],
      summary: 'Verify the complete HMAC audit chain',
      operationId: 'verifyPlatformAuditChain',
      responses: {
        200: jsonResponse('Verification result.', ref('AuditVerification')),
        ...standardErrors('Unauthorized', 'Forbidden', 'ServiceUnavailable'),
      },
    }, { scopes: ['platform:audit:verify'] }),
  },
  '/platform/webhooks': {
    get: secured({
      tags: ['Platform Webhooks'],
      summary: 'List webhook subscriptions',
      operationId: 'listWebhookSubscriptions',
      parameters: [{ name: 'includeInactive', in: 'query', schema: { type: 'boolean', default: true } }],
      responses: {
        200: jsonResponse('Subscriptions. Signing secrets are never returned.', { type: 'array', items: ref('WebhookSubscription') }),
        ...standardErrors('Unauthorized', 'Forbidden'),
      },
    }, { scopes: ['platform:webhooks:read'] }),
    post: secured({
      tags: ['Platform Webhooks'],
      summary: 'Create a signed outbound webhook subscription',
      description: 'The signing secret is returned once. HTTPS and public-network targets are required by default.',
      operationId: 'createWebhookSubscription',
      requestBody: jsonBody(ref('WebhookCreateRequest')),
      responses: {
        201: jsonResponse('Subscription created.', ref('WebhookCreateResult')),
        ...standardErrors('BadRequest', 'Unauthorized', 'Forbidden', 'ServiceUnavailable'),
      },
    }, { scopes: ['platform:webhooks:write'] }),
  },
  '/platform/webhooks/{id}': {
    patch: secured({
      tags: ['Platform Webhooks'],
      summary: 'Update or rotate a webhook subscription',
      operationId: 'updateWebhookSubscription',
      parameters: [idParameter('Webhook subscription identifier.')],
      requestBody: jsonBody(ref('WebhookUpdateRequest')),
      responses: {
        200: jsonResponse('Subscription updated.', ref('WebhookUpdateResult')),
        ...standardErrors('BadRequest', 'Unauthorized', 'Forbidden', 'NotFound', 'ServiceUnavailable'),
      },
    }, { scopes: ['platform:webhooks:write'] }),
    delete: secured({
      tags: ['Platform Webhooks'],
      summary: 'Disable a webhook subscription',
      description: 'Subscriptions are disabled rather than physically deleted.',
      operationId: 'disableWebhookSubscription',
      parameters: [idParameter('Webhook subscription identifier.')],
      responses: {
        204: { description: 'Subscription disabled.' },
        ...standardErrors('Unauthorized', 'Forbidden', 'NotFound', 'ServiceUnavailable'),
      },
    }, { scopes: ['platform:webhooks:write'] }),
  },
  '/platform/webhooks/{id}/test': {
    post: secured({
      tags: ['Platform Webhooks'],
      summary: 'Queue a test event for one subscription',
      operationId: 'testWebhookSubscription',
      parameters: [idParameter('Webhook subscription identifier.')],
      responses: {
        202: jsonResponse('Test event queued.', ref('QueuedWebhookEvent')),
        ...standardErrors('Unauthorized', 'Forbidden', 'NotFound', 'Conflict', 'ServiceUnavailable'),
      },
    }, { scopes: ['platform:webhooks:deliver'] }),
  },
  '/platform/webhook-deliveries': {
    get: secured({
      tags: ['Platform Webhooks'],
      summary: 'List webhook delivery attempts',
      operationId: 'listWebhookDeliveries',
      parameters: [
        limitParameter,
        { name: 'subscriptionId', in: 'query', schema: { type: 'string' } },
        { name: 'eventId', in: 'query', schema: { type: 'string' } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['Pending', 'Delivering', 'Succeeded', 'Failed'] } },
      ],
      responses: {
        200: jsonResponse('Delivery attempts.', { type: 'array', items: ref('WebhookDeliveryAttempt') }),
        ...standardErrors('BadRequest', 'Unauthorized', 'Forbidden'),
      },
    }, { scopes: ['platform:webhooks:read'] }),
  },
  '/platform/webhook-deliveries/process': {
    post: secured({
      tags: ['Platform Webhooks'],
      summary: 'Process a bounded batch of due webhook deliveries',
      description: 'Privileged operator drain. Production runs the same leased processor continuously unless NEXUSHOS_DELIVERY_WORKER_ENABLED=false.',
      operationId: 'processWebhookDeliveries',
      requestBody: jsonBody({
        type: 'object',
        properties: { limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 } },
        additionalProperties: false,
      }, undefined, false),
      responses: {
        200: jsonResponse('Delivery batch processed.', ref('WebhookDeliverySummary')),
        ...standardErrors('BadRequest', 'Unauthorized', 'Forbidden', 'ServiceUnavailable'),
      },
    }, { scopes: ['platform:webhooks:deliver'] }),
  },
  '/workflows/events': {
    get: secured({
      tags: ['Workflows'],
      summary: 'Inspect durable workflow event delivery',
      operationId: 'listWorkflowEvents',
      parameters: [
        limitParameter,
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['Pending', 'Processing', 'Completed', 'Failed', 'all'] } },
      ],
      responses: {
        200: jsonResponse('Durable workflow events.', {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
        }),
        ...standardErrors('BadRequest', 'Unauthorized', 'Forbidden'),
      },
    }, { roles: ['General Manager'] }),
  },
  '/workflows/events/process': {
    post: secured({
      tags: ['Workflows'],
      summary: 'Process a bounded batch of durable workflow events',
      operationId: 'processWorkflowEvents',
      requestBody: jsonBody({
        type: 'object',
        properties: { limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 } },
        additionalProperties: false,
      }, undefined, false),
      responses: {
        200: jsonResponse('Workflow event processing summary.', {
          type: 'object',
          additionalProperties: { type: 'integer', minimum: 0 },
        }),
        ...standardErrors('BadRequest', 'Unauthorized', 'Forbidden'),
      },
    }, { roles: ['General Manager'] }),
  },
  '/workflows/templates': {
    get: secured({
      tags: ['Workflows'],
      summary: 'List workflow templates',
      operationId: 'listWorkflowTemplates',
      parameters: [
        limitParameter,
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['Active', 'Paused', 'Archived', 'all'] } },
      ],
      responses: {
        200: jsonResponse('Workflow templates.', { type: 'array', items: ref('WorkflowTemplate') }),
        ...standardErrors('BadRequest', 'Unauthorized', 'Forbidden'),
      },
    }, { roles: ALL_OPERATIONAL_ROLES }),
    post: secured({
      tags: ['Workflows'],
      summary: 'Create a workflow template',
      operationId: 'createWorkflowTemplate',
      requestBody: jsonBody(ref('WorkflowTemplateInput')),
      responses: {
        201: jsonResponse('Workflow template created.', ref('WorkflowTemplate')),
        ...standardErrors('BadRequest', 'Unauthorized', 'Forbidden'),
      },
    }, { roles: ['General Manager'] }),
  },
  '/workflows/templates/{id}': {
    get: secured({
      tags: ['Workflows'],
      summary: 'Get one workflow template',
      operationId: 'getWorkflowTemplate',
      parameters: [idParameter('Workflow template identifier.')],
      responses: {
        200: jsonResponse('Workflow template.', ref('WorkflowTemplate')),
        ...standardErrors('Unauthorized', 'Forbidden', 'NotFound'),
      },
    }, { roles: ALL_OPERATIONAL_ROLES }),
    patch: secured({
      tags: ['Workflows'],
      summary: 'Update a versioned workflow template',
      operationId: 'updateWorkflowTemplate',
      parameters: [idParameter('Workflow template identifier.')],
      requestBody: jsonBody(ref('WorkflowTemplatePatch')),
      responses: {
        200: jsonResponse('Updated workflow template.', ref('WorkflowTemplate')),
        ...standardErrors('BadRequest', 'Unauthorized', 'Forbidden', 'NotFound', 'Conflict'),
      },
    }, { roles: ['General Manager'] }),
    delete: secured({
      tags: ['Workflows'],
      summary: 'Archive a workflow template',
      operationId: 'archiveWorkflowTemplate',
      parameters: [idParameter('Workflow template identifier.')],
      responses: {
        204: { description: 'Template archived.' },
        ...standardErrors('Unauthorized', 'Forbidden', 'NotFound'),
      },
    }, { roles: ['General Manager'] }),
  },
  '/workflows/templates/{id}/run': {
    post: secured({
      tags: ['Workflow Runs'],
      summary: 'Start or safely replay a workflow run',
      description: 'Idempotency is supplied in the JSON idempotencyKey field for this currently implemented workflow contract.',
      operationId: 'startWorkflowRun',
      parameters: [idParameter('Workflow template identifier.')],
      requestBody: jsonBody(ref('WorkflowRunRequest')),
      responses: {
        200: jsonResponse('Existing idempotent run replayed.', ref('WorkflowRun')),
        201: jsonResponse('Run executed without approval.', ref('WorkflowRun')),
        202: jsonResponse('Run created and awaiting approval.', ref('WorkflowRun')),
        ...standardErrors('BadRequest', 'Unauthorized', 'Forbidden', 'NotFound', 'Conflict'),
      },
    }, { roles: ALL_OPERATIONAL_ROLES }),
  },
  '/workflows/runs': {
    get: secured({
      tags: ['Workflow Runs'],
      summary: 'List workflow runs',
      operationId: 'listWorkflowRuns',
      parameters: [
        limitParameter,
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['Awaiting Approval', 'Running', 'Completed', 'Rejected', 'Failed', 'all'] } },
      ],
      responses: {
        200: jsonResponse('Workflow runs.', { type: 'array', items: ref('WorkflowRun') }),
        ...standardErrors('BadRequest', 'Unauthorized', 'Forbidden'),
      },
    }, { roles: ALL_OPERATIONAL_ROLES }),
  },
  '/workflows/runs/{id}': {
    get: secured({
      tags: ['Workflow Runs'],
      summary: 'Get a workflow run with tasks and audit evidence',
      operationId: 'getWorkflowRun',
      parameters: [idParameter('Workflow run identifier.')],
      responses: {
        200: jsonResponse('Detailed workflow run.', ref('WorkflowRun')),
        ...standardErrors('Unauthorized', 'Forbidden', 'NotFound'),
      },
    }, { roles: ALL_OPERATIONAL_ROLES }),
  },
  '/workflows/runs/{id}/approve': {
    post: secured({
      tags: ['Workflow Runs'],
      summary: 'Approve and execute a pending workflow run',
      operationId: 'approveWorkflowRun',
      parameters: [idParameter('Workflow run identifier.')],
      responses: {
        200: jsonResponse('Approved run, or idempotent replay of an already completed run.', ref('WorkflowRun')),
        ...standardErrors('Unauthorized', 'Forbidden', 'NotFound', 'Conflict'),
      },
    }, { roles: ['General Manager'] }),
  },
  '/workflows/runs/{id}/reject': {
    post: secured({
      tags: ['Workflow Runs'],
      summary: 'Reject a pending workflow run',
      operationId: 'rejectWorkflowRun',
      parameters: [idParameter('Workflow run identifier.')],
      requestBody: jsonBody({
        type: 'object',
        properties: { reason: { type: 'string', maxLength: 500 } },
        additionalProperties: false,
      }, undefined, false),
      responses: {
        200: jsonResponse('Rejected run, or idempotent replay of an already rejected run.', ref('WorkflowRun')),
        ...standardErrors('Unauthorized', 'Forbidden', 'NotFound', 'Conflict'),
      },
    }, { roles: ['General Manager'] }),
  },
  '/workflows/tasks': {
    get: secured({
      tags: ['Workflow Tasks'],
      summary: 'List operational workflow tasks',
      operationId: 'listWorkflowTasks',
      parameters: [
        limitParameter,
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'all', 'Open', 'In Progress', 'Blocked', 'Completed', 'Cancelled'] } },
      ],
      responses: {
        200: jsonResponse('Workflow tasks.', { type: 'array', items: ref('WorkflowTask') }),
        ...standardErrors('BadRequest', 'Unauthorized', 'Forbidden'),
      },
    }, { roles: ALL_OPERATIONAL_ROLES }),
    post: secured({
      tags: ['Workflow Tasks'],
      summary: 'Create a manual operational task',
      operationId: 'createWorkflowTask',
      requestBody: jsonBody(ref('WorkflowTaskInput')),
      responses: {
        201: jsonResponse('Task created.', ref('WorkflowTask')),
        ...standardErrors('BadRequest', 'Unauthorized', 'Forbidden'),
      },
    }, { roles: ALL_OPERATIONAL_ROLES }),
  },
  '/workflows/tasks/{id}': {
    get: secured({
      tags: ['Workflow Tasks'],
      summary: 'Get one operational task',
      operationId: 'getWorkflowTask',
      parameters: [idParameter('Workflow task identifier.')],
      responses: {
        200: jsonResponse('Workflow task.', ref('WorkflowTask')),
        ...standardErrors('Unauthorized', 'Forbidden', 'NotFound'),
      },
    }, { roles: ALL_OPERATIONAL_ROLES }),
    patch: secured({
      tags: ['Workflow Tasks'],
      summary: 'Update a non-terminal operational task',
      operationId: 'updateWorkflowTask',
      parameters: [idParameter('Workflow task identifier.')],
      requestBody: jsonBody(ref('WorkflowTaskPatch')),
      responses: {
        200: jsonResponse('Task updated.', ref('WorkflowTask')),
        ...standardErrors('BadRequest', 'Unauthorized', 'Forbidden', 'NotFound', 'Conflict'),
      },
    }, { roles: ALL_OPERATIONAL_ROLES }),
    delete: secured({
      tags: ['Workflow Tasks'],
      summary: 'Cancel an operational task',
      operationId: 'cancelWorkflowTask',
      parameters: [idParameter('Workflow task identifier.')],
      responses: {
        204: { description: 'Task cancelled, or terminal task left unchanged.' },
        ...standardErrors('Unauthorized', 'Forbidden', 'NotFound'),
      },
    }, { roles: ALL_OPERATIONAL_ROLES }),
  },
  '/workflows/audit': {
    get: secured({
      tags: ['Workflows'],
      summary: 'Read the immutable workflow audit feed',
      operationId: 'listWorkflowAuditEvents',
      parameters: [
        limitParameter,
        { name: 'entityType', in: 'query', schema: { type: 'string', enum: ['template', 'run', 'task'] } },
      ],
      responses: {
        200: jsonResponse('Workflow audit events.', { type: 'array', items: ref('WorkflowAuditEvent') }),
        ...standardErrors('BadRequest', 'Unauthorized', 'Forbidden'),
      },
    }, { roles: ALL_OPERATIONAL_ROLES }),
  },
};

export const OPENAPI_DOCUMENT = Object.freeze({
  openapi: '3.1.0',
  jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema',
  info: {
    title: 'NexusHOS API',
    version: API_CONTRACT_VERSION,
    summary: 'Implemented public booking, platform assurance, webhook, and workflow contracts.',
    description: 'This document describes implemented NexusHOS HTTP behavior. Paths currently remain under /api rather than a URI /v1 prefix; info.version is the versioned contract. Core hotel and ERP routes outside the selected discovery surface are intentionally not claimed here.',
  },
  servers: [{ url: '/api', description: 'Same-origin NexusHOS API' }],
  tags: [
    { name: 'Public', description: 'Unauthenticated operational readiness.' },
    { name: 'Authentication', description: 'Cookie and opaque bearer sessions.' },
    { name: 'Public Booking', description: 'Availability, immutable quotes, and idempotent pay-at-property reservations.' },
    { name: 'Developer', description: 'Contract and integration discovery.' },
    { name: 'Platform Audit', description: 'Scoped immutable audit inspection and verification.' },
    { name: 'Platform Webhooks', description: 'Scoped subscriptions, signed delivery evidence, and operator processing.' },
    { name: 'Workflows', description: 'Versioned workflow templates and immutable workflow audit.' },
    { name: 'Workflow Runs', description: 'Idempotent execution with risk-based approval.' },
    { name: 'Workflow Tasks', description: 'Persisted frontline operational tasks.' },
  ],
  paths,
  components: {
    securitySchemes: {
      SessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: SESSION_COOKIE,
        description: `HttpOnly, SameSite=Strict browser session. Current TTL: ${SESSION_TTL_MS / 3_600_000} hours.`,
      },
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'opaque session token',
        description: 'Use the opaque token returned by POST /auth/login. It has the same session lifetime as the cookie.',
      },
    },
    schemas,
    responses,
  },
});

const documentedOperationCount = () => Object.values(OPENAPI_DOCUMENT.paths)
  .reduce((count, pathItem) => count + Object.keys(pathItem)
    .filter((key) => ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'].includes(key)).length, 0);

const tableExists = (name) => !!db.prepare(
  "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
).get(name);

const secretStatus = (name) => {
  const configured = typeof process.env[name] === 'string'
    && Buffer.byteLength(process.env[name], 'utf8') >= 32;
  if (configured) return 'configured';
  return process.env.NODE_ENV === 'production' ? 'missing' : 'local-development-fallback';
};

r.get('/openapi.json', (_req, res) => {
  res.type('application/vnd.oai.openapi+json');
  res.setHeader('Content-Disposition', 'inline; filename="nexushos-openapi.json"');
  res.json(OPENAPI_DOCUMENT);
});

r.get('/developer/status', requireAuth, developerRateLimit, requirePasswordChangeComplete, (req, res) => {
  let databaseReady = false;
  try { databaseReady = db.prepare('SELECT 1 AS ok').get().ok === 1; } catch { databaseReady = false; }
  const webhookTables = ['webhook_subscriptions', 'webhook_events', 'webhook_delivery_attempts'];
  const workflowTables = ['workflow_templates', 'workflow_runs', 'workflow_tasks', 'workflow_audit_events'];
  const auditTables = ['audit_events'];
  const allowedOriginCount = (process.env.HMS_ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',').map((value) => value.trim()).filter(Boolean).length;
  const workerSetting = process.env.NEXUSHOS_DELIVERY_WORKER_ENABLED?.trim().toLowerCase();
  const backgroundWorkerEnabled = workerSetting === 'true'
    || (process.env.NODE_ENV === 'production' && workerSetting !== 'false');

  res.json({
    contractVersion: API_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    businessDate: today(),
    environment: process.env.NODE_ENV || 'development',
    actor: {
      role: req.user.role,
      authenticatedBy: req.authMethod,
      grantedPlatformScopes: grantedScopesFor(req),
    },
    authentication: {
      cookie: { ready: true, name: SESSION_COOKIE, httpOnly: true, sameSite: 'Strict' },
      bearer: { ready: true, format: 'opaque session token' },
      sessionTtlHours: SESSION_TTL_MS / 3_600_000,
    },
    database: {
      ready: databaseReady,
      driver: 'node:sqlite DatabaseSync',
      schemaMigrationsVersioned: false,
    },
    openApi: {
      ready: true,
      version: API_CONTRACT_VERSION,
      format: 'OpenAPI 3.1 JSON',
      url: '/api/openapi.json',
      uriVersioned: false,
      documentedOperations: documentedOperationCount(),
      documentedSurface: ['health', 'authentication', 'public booking', 'developer discovery', 'platform audit', 'platform webhooks', 'workflows'],
    },
    webhooks: {
      schemaReady: webhookTables.every(tableExists),
      emittedEventTypes: OUTBOUND_EVENTS.map((event) => event.type),
      signature: 'HMAC-SHA256 v1',
      encryptionKey: secretStatus('NEXUSHOS_WEBHOOK_ENCRYPTION_KEY'),
      subscriptionEndpointsReady: true,
      manualDrainEndpointReady: true,
      backgroundDeliveryWorkerStartedByThisServer: backgroundWorkerEnabled,
    },
    workflows: {
      schemaReady: workflowTables.every(tableExists),
      eventTriggers: WORKFLOW_EVENT_TRIGGERS.map((event) => event.type),
      versionedTemplates: true,
      idempotentRuns: true,
      approvalGates: true,
    },
    audit: {
      schemaReady: auditTables.every(tableExists),
      appendOnlyChain: true,
      signingKey: secretStatus('NEXUSHOS_AUDIT_HMAC_SECRET'),
    },
    http: {
      credentialedCors: true,
      configuredOriginCount: allowedOriginCount,
      requestIds: true,
      authenticatedRateLimit: '600 requests per actor per minute by default',
      publicBookingRateLimit: '120 requests per source address per minute by default',
    },
    limitations: [
      'HTTP paths are not yet URI-versioned; the OpenAPI info.version is the current contract version.',
      'This document intentionally covers the public, developer, platform, and workflow surface, not every internal hotel or ERP route.',
      ...(backgroundWorkerEnabled ? [] : [
        'The continuous delivery worker is disabled in this environment; use the privileged drain endpoint or enable a dedicated worker.',
      ]),
      'Schema changes are still bootstrapped by modules rather than a formal migration history.',
    ],
  });
});

r.get('/developer/events/catalog', requireAuth, developerRateLimit, requirePasswordChangeComplete, (_req, res) => {
  res.json({
    ...EVENT_CATALOG,
    generatedAt: new Date().toISOString(),
  });
});

export default r;
