// Privileged platform APIs for immutable audit inspection and outbound webhooks.
// Authentication is supplied by the existing `requireAuth` middleware; this
// router adds narrow platform scopes on top of the authenticated principal.
import { Router } from 'express';
import { db as defaultDb } from '../db.js';
import { requireScopes, initializeSecuritySchema } from '../security.js';
import {
  initializeAuditSchema,
  queryAuditEvents,
  recordAuditFromRequest,
  verifyAuditChain,
} from '../audit.js';
import {
  createWebhookSubscription,
  deliverDueWebhooks,
  disableWebhookSubscription,
  enqueueWebhookEvent,
  initializeWebhookSchema,
  listWebhookDeliveryAttempts,
  listWebhookSubscriptions,
  updateWebhookSubscription,
} from '../webhooks.js';

const configuredSecret = (value) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') >= 32;
const envFlag = (value) => /^(1|true|yes)$/i.test(value || '');

const asRouteError = (error) => {
  if (Number.isInteger(error?.status)) return error;
  if (error instanceof TypeError) return Object.assign(error, { status: 400 });
  return error;
};

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch((error) => next(asRouteError(error)));
};

const parsePositiveInteger = (value, name, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) => {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw Object.assign(new TypeError(`${name} must be an integer`), { status: 400 });
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw Object.assign(new TypeError(`${name} must be between ${min} and ${max}`), { status: 400 });
  }
  return parsed;
};

const requireConfiguredSecret = (value, label) => (req, res, next) => {
  if (!configuredSecret(value)) {
    return res.status(503).json({
      error: `${label} is not configured`,
      requestId: req.id,
    });
  }
  next();
};

const requireJsonObject = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new TypeError('A JSON object body is required');
  }
  return body;
};

export function initializePlatformSchema(database = defaultDb) {
  initializeSecuritySchema(database);
  initializeAuditSchema(database);
  initializeWebhookSchema(database);
}

export function createPlatformRouter({
  database = defaultDb,
  auditSecret = process.env.NEXUSHOS_AUDIT_HMAC_SECRET,
  webhookEncryptionKey = process.env.NEXUSHOS_WEBHOOK_ENCRYPTION_KEY,
  allowPrivateWebhookNetworks = envFlag(process.env.NEXUSHOS_WEBHOOK_ALLOW_PRIVATE_NETWORKS),
  allowInsecureWebhookHttp = envFlag(process.env.NEXUSHOS_WEBHOOK_ALLOW_INSECURE_HTTP),
} = {}) {
  initializePlatformSchema(database);
  const router = Router();
  const needAuditSecret = requireConfiguredSecret(auditSecret, 'Audit signing key');
  const needWebhookKey = requireConfiguredSecret(webhookEncryptionKey, 'Webhook encryption key');
  const webhookOptions = {
    database,
    key: webhookEncryptionKey,
    allowPrivateNetworks: allowPrivateWebhookNetworks,
    allowInsecureHttp: allowInsecureWebhookHttp,
  };

  // ---------------------------------------------------------- audit events --
  router.get(
    '/platform/audit-events',
    requireScopes('platform:audit:read'),
    (req, res, next) => {
      try {
        const limit = parsePositiveInteger(req.query.limit, 'limit', { max: 200 }) || 50;
        const beforeSequence = parsePositiveInteger(req.query.beforeSequence, 'beforeSequence');
        const events = queryAuditEvents({
          database,
          limit,
          beforeSequence,
          action: req.query.action,
          resourceType: req.query.resourceType,
          resourceId: req.query.resourceId,
          actorId: req.query.actorId,
          outcome: req.query.outcome,
          from: req.query.from,
          to: req.query.to,
        });
        res.json({
          events,
          nextBeforeSequence: events.length === limit ? events.at(-1).sequence : null,
        });
      } catch (error) {
        next(asRouteError(error));
      }
    },
  );

  router.get(
    '/platform/audit-events/verify',
    requireScopes('platform:audit:verify'),
    needAuditSecret,
    (req, res, next) => {
      try {
        res.json(verifyAuditChain({ database, secret: auditSecret }));
      } catch (error) {
        next(error);
      }
    },
  );

  // -------------------------------------------------- webhook subscriptions --
  router.get(
    '/platform/webhooks',
    requireScopes('platform:webhooks:read'),
    (req, res) => {
      const includeInactive = req.query.includeInactive !== 'false';
      res.json(listWebhookSubscriptions({ database, includeInactive }));
    },
  );

  router.post(
    '/platform/webhooks',
    requireScopes('platform:webhooks:write'),
    needAuditSecret,
    needWebhookKey,
    asyncRoute(async (req, res) => {
      const body = requireJsonObject(req.body);
      const result = await createWebhookSubscription({
        url: body.url,
        description: body.description,
        eventTypes: body.eventTypes,
        createdBy: req.user.id,
      }, webhookOptions);
      recordAuditFromRequest(req, {
        action: 'platform.webhook.subscription.created',
        resourceType: 'webhook-subscription',
        resourceId: result.subscription.id,
        metadata: {
          // Do not duplicate a potentially credential-bearing path/query in
          // the immutable audit log; administrators can inspect the scoped
          // subscription record itself.
          destinationOrigin: new URL(result.subscription.url).origin,
          eventTypes: result.subscription.eventTypes,
        },
      }, { database, secret: auditSecret });
      // signingSecret is intentionally returned once and never exposed by GET.
      res.status(201).json(result);
    }),
  );

  router.patch(
    '/platform/webhooks/:id',
    requireScopes('platform:webhooks:write'),
    needAuditSecret,
    needWebhookKey,
    asyncRoute(async (req, res) => {
      const body = requireJsonObject(req.body);
      const allowed = new Set(['url', 'description', 'eventTypes', 'active', 'rotateSecret']);
      const unknown = Object.keys(body).filter((key) => !allowed.has(key));
      if (unknown.length) throw new TypeError(`Unknown fields: ${unknown.join(', ')}`);
      if (Object.keys(body).length === 0) throw new TypeError('At least one webhook field is required');
      if (Object.hasOwn(body, 'rotateSecret') && typeof body.rotateSecret !== 'boolean') {
        throw new TypeError('rotateSecret must be a boolean');
      }
      const result = await updateWebhookSubscription(req.params.id, body, webhookOptions);
      if (!result) return res.status(404).json({ error: 'Webhook subscription not found', requestId: req.id });
      recordAuditFromRequest(req, {
        action: 'platform.webhook.subscription.updated',
        resourceType: 'webhook-subscription',
        resourceId: req.params.id,
        metadata: {
          changedFields: Object.keys(body),
          secretRotated: !!result.signingSecret,
        },
      }, { database, secret: auditSecret });
      res.json(result);
    }),
  );

  router.delete(
    '/platform/webhooks/:id',
    requireScopes('platform:webhooks:write'),
    needAuditSecret,
    (req, res, next) => {
      try {
        if (!disableWebhookSubscription(req.params.id, { database })) {
          return res.status(404).json({ error: 'Webhook subscription not found', requestId: req.id });
        }
        recordAuditFromRequest(req, {
          action: 'platform.webhook.subscription.disabled',
          resourceType: 'webhook-subscription',
          resourceId: req.params.id,
        }, { database, secret: auditSecret });
        res.status(204).end();
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/platform/webhooks/:id/test',
    requireScopes('platform:webhooks:deliver'),
    needAuditSecret,
    needWebhookKey,
    (req, res, next) => {
      try {
        const subscription = listWebhookSubscriptions({ database })
          .find((candidate) => candidate.id === req.params.id);
        if (!subscription) {
          return res.status(404).json({ error: 'Webhook subscription not found', requestId: req.id });
        }
        if (!subscription.active) {
          return res.status(409).json({ error: 'Webhook subscription is inactive', requestId: req.id });
        }
        const event = enqueueWebhookEvent('platform.webhook.test', {
          message: 'NexusHOS webhook test',
          requestedBy: req.user.id,
          requestedAt: new Date().toISOString(),
        }, {
          database,
          requestId: req.id,
          subscriptionIds: [subscription.id],
          ignoreEventTypeFilter: true,
        });
        recordAuditFromRequest(req, {
          action: 'platform.webhook.test.enqueued',
          resourceType: 'webhook-subscription',
          resourceId: subscription.id,
          metadata: { eventId: event.id },
        }, { database, secret: auditSecret });
        res.status(202).json(event);
      } catch (error) {
        next(asRouteError(error));
      }
    },
  );

  // ---------------------------------------------------- delivery operations --
  router.get(
    '/platform/webhook-deliveries',
    requireScopes('platform:webhooks:read'),
    (req, res, next) => {
      try {
        const limit = parsePositiveInteger(req.query.limit, 'limit', { max: 200 }) || 50;
        res.json(listWebhookDeliveryAttempts({
          database,
          limit,
          subscriptionId: req.query.subscriptionId,
          eventId: req.query.eventId,
          status: req.query.status,
        }));
      } catch (error) {
        next(asRouteError(error));
      }
    },
  );

  // Production deployments should invoke `deliverDueWebhooks` from a dedicated
  // worker. This privileged endpoint is useful for an operator-triggered drain.
  router.post(
    '/platform/webhook-deliveries/process',
    requireScopes('platform:webhooks:deliver'),
    needAuditSecret,
    needWebhookKey,
    asyncRoute(async (req, res) => {
      const body = req.body == null ? {} : requireJsonObject(req.body);
      const limit = body.limit == null ? 25 : body.limit;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new TypeError('limit must be an integer from 1 to 100');
      }
      const summary = await deliverDueWebhooks({ ...webhookOptions, limit });
      recordAuditFromRequest(req, {
        action: 'platform.webhook.deliveries.processed',
        resourceType: 'webhook-delivery-batch',
        resourceId: req.id,
        metadata: summary,
      }, { database, secret: auditSecret });
      res.json(summary);
    }),
  );

  return router;
}

const platformRoutes = createPlatformRouter();
export default platformRoutes;
