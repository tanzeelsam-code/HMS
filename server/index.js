// index.js — AuraHMS local backend entry point (port 4000).
import crypto from 'node:crypto';
import express from 'express';
import {
  changePassword,
  currentSession,
  login,
  logout,
  requireAuth,
  requirePasswordChangeComplete,
} from './auth.js';
import coreRoutes from './routes/core.js';
import erpRoutes from './routes/erp.js';
import aiRoutes from './routes/ai.js';
import bookingRoutes from './routes/booking.js';
import portfolioRoutes from './routes/portfolio.js';
import workflowRoutes, { processWorkflowEventOutbox } from './routes/workflows.js';
import { createAdminRouter } from './routes/admin.js';
import developerRoutes from './routes/developer.js';
import {
  createApiRateLimiter,
  createLoginRateLimiters,
  createSecurityMiddleware,
  createPostgresRateLimiter,
} from './security.js';
import { createMutationAuditMiddleware, recordAuditFromRequest } from './audit.js';
import { createPlatformRouter } from './routes/platform.js';
import { db, DB_PATH } from './db.js';
import { backfillOperationalFolioJournals } from './accounting.js';
import { deliverDueWebhooks } from './webhooks.js';

// Router imports above install their additive tables. Re-assert private-schema
// grants after every table and trigger exists so Supabase Data API roles cannot
// reach internal hotel records directly.
db.secureSchema();

const isProduction = process.env.NODE_ENV === 'production';
const productionSecret = (name) => {
  const value = process.env[name]?.trim();
  if (!value || Buffer.byteLength(value, 'utf8') < 32 || new Set(value).size < 12
    || /(change[-_ ]?me|example|sample|placeholder|default|local)/i.test(value)) {
    throw new Error(`${name} must be an independent, high-entropy, non-placeholder secret of at least 32 bytes in production`);
  }
  return value;
};

let localAuditSecret;
let localWebhookKey;
if (isProduction) {
  localAuditSecret = productionSecret('NEXUSHOS_AUDIT_HMAC_SECRET');
  localWebhookKey = productionSecret('NEXUSHOS_WEBHOOK_ENCRYPTION_KEY');
  const rateLimitPepper = productionSecret('NEXUSHOS_RATE_LIMIT_PEPPER');
  if (new Set([localAuditSecret, localWebhookKey, rateLimitPepper]).size !== 3) {
    throw new Error('Audit signing, webhook encryption, and rate limiting must use different production secrets');
  }
  if (Number(db.prepare('SELECT COUNT(*) AS count FROM users').get().count) === 0) {
    throw new Error(
      'Refusing to start NexusHOS with no production administrator. '
      + 'Run npm run bootstrap:admin through the deployment secret manager first.',
    );
  }
} else {
  localAuditSecret = process.env.NEXUSHOS_AUDIT_HMAC_SECRET
    || 'nexushos-local-audit-key-change-before-production-2026';
  localWebhookKey = process.env.NEXUSHOS_WEBHOOK_ENCRYPTION_KEY
    || 'nexushos-local-webhook-key-change-before-production-2026';
  if (!process.env.NEXUSHOS_AUDIT_HMAC_SECRET || !process.env.NEXUSHOS_WEBHOOK_ENCRYPTION_KEY) {
    console.warn('[security] development-only audit/webhook keys are active; configure independent secrets before deployment');
  }
}

const backfilledFolios = backfillOperationalFolioJournals();
if (backfilledFolios > 0) {
  console.log(`[db] backfilled ${backfilledFolios} operational folio journal posting(s)`);
}

const app = express();

const trustProxy = process.env.HMS_TRUST_PROXY?.trim();
if (trustProxy) {
  if (/^\d+$/.test(trustProxy)) {
    const hopCount = Number(trustProxy);
    if (!Number.isInteger(hopCount) || hopCount < 1 || hopCount > 5) {
      throw new Error('HMS_TRUST_PROXY hop count must be between 1 and 5');
    }
    app.set('trust proxy', hopCount);
  } else {
    const proxies = trustProxy.split(',').map((value) => value.trim()).filter(Boolean);
    if (!proxies.length || proxies.some((value) => /^(true|false|\*)$/i.test(value))) {
      throw new Error('HMS_TRUST_PROXY must list explicit proxy addresses/subnets or a hop count from 1 to 5');
    }
    app.set('trust proxy', proxies);
  }
}
app.use(express.json());
app.use('/api', createSecurityMiddleware());
const platformRoutes = createPlatformRouter({
  database: db,
  auditSecret: localAuditSecret,
  webhookEncryptionKey: localWebhookKey,
});
const adminRoutes = createAdminRouter({ database: db, auditSecret: localAuditSecret });

const accountDigest = (req) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '<none>';
  return crypto.createHmac('sha256', localAuditSecret).update(email).digest('hex');
};
const createAuthAuditMiddleware = (action, { onlyUnauthorized = false } = {}) => (req, res, next) => {
  const startedAt = Date.now();
  res.once('finish', () => {
    if (onlyUnauthorized && res.statusCode !== 401) return;
    try {
      const outcome = [401, 403, 429].includes(res.statusCode)
        ? 'denied'
        : res.statusCode >= 400 ? 'failure' : 'success';
      recordAuditFromRequest(req, {
        action,
        resourceType: 'session',
        outcome,
        source: 'auth',
        metadata: {
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt,
          accountDigest: accountDigest(req),
          authMethod: req.authMethod || null,
        },
      }, { database: db, secret: localAuditSecret });
    } catch (error) {
      console.error('[audit] unable to append authentication event', error);
    }
  });
  next();
};

const allowedOrigins = new Set(
  (process.env.HMS_ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
if (isProduction) {
  if (!process.env.HMS_ALLOWED_ORIGINS?.trim() || allowedOrigins.size === 0) {
    throw new Error('HMS_ALLOWED_ORIGINS must explicitly list approved HTTPS origins in production');
  }
  for (const origin of allowedOrigins) {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`HMS_ALLOWED_ORIGINS contains an invalid origin: ${origin}`);
    }
    if (parsed.protocol !== 'https:' || parsed.origin !== origin || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(parsed.hostname)) {
      throw new Error(`Production CORS origins must be exact public HTTPS origins: ${origin}`);
    }
  }
}

// Same-origin deployment is preferred. Explicit origins support the local
// Vite client and approved embedders without reflecting arbitrary callers.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok', database: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});
app.use('/api/booking', createPostgresRateLimiter({
  database: db,
  scope: 'api.booking.ip',
  limit: 120,
  windowMs: 60_000,
}), bookingRoutes);
app.use('/api', developerRoutes);
const authenticatedRateLimiter = createApiRateLimiter({ database: db });
const mutationAudit = createMutationAuditMiddleware({ database: db, secret: localAuditSecret });
app.post(
  '/api/auth/login',
  createAuthAuditMiddleware('auth.login'),
  ...createLoginRateLimiters({ database: db }),
  login,
);
app.get(
  '/api/auth/session',
  createAuthAuditMiddleware('auth.session'),
  requireAuth,
  authenticatedRateLimiter,
  currentSession,
);
app.post(
  '/api/auth/logout',
  createAuthAuditMiddleware('auth.logout'),
  requireAuth,
  authenticatedRateLimiter,
  mutationAudit,
  logout,
);
app.post(
  '/api/auth/change-password',
  createAuthAuditMiddleware('auth.password.change'),
  requireAuth,
  authenticatedRateLimiter,
  mutationAudit,
  changePassword,
);
app.use(
  '/api',
  createAuthAuditMiddleware('auth.authorization.denied', { onlyUnauthorized: true }),
  requireAuth,
  authenticatedRateLimiter,
  requirePasswordChangeComplete,
  mutationAudit,
  coreRoutes,
  erpRoutes,
  aiRoutes,
  portfolioRoutes,
  workflowRoutes,
  platformRoutes,
  adminRoutes,
);

app.use('/api', (req, res) => res.status(404).json({ error: `Not found: ${req.method} ${req.path}` }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(Number.isInteger(err.status) ? err.status : 500)
    .json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`[server] NexusHOS API listening on http://localhost:${PORT} (db: ${DB_PATH})`);
  const workerSetting = process.env.NEXUSHOS_DELIVERY_WORKER_ENABLED?.trim().toLowerCase();
  const workerEnabled = workerSetting === 'true' || (isProduction && workerSetting !== 'false');
  if (!workerEnabled) return;
  const intervalMs = Number(process.env.NEXUSHOS_DELIVERY_WORKER_INTERVAL_MS || 5_000);
  if (!Number.isInteger(intervalMs) || intervalMs < 1_000 || intervalMs > 60_000) {
    throw new Error('NEXUSHOS_DELIVERY_WORKER_INTERVAL_MS must be an integer from 1000 to 60000');
  }
  let running = false;
  const runDeliveries = async () => {
    if (running) return;
    running = true;
    try {
      processWorkflowEventOutbox({ limit: 50 });
      await deliverDueWebhooks({
        database: db,
        key: localWebhookKey,
        limit: 50,
        allowPrivateNetworks: process.env.NEXUSHOS_WEBHOOK_ALLOW_PRIVATE_NETWORKS === 'true',
        allowInsecureHttp: process.env.NEXUSHOS_WEBHOOK_ALLOW_INSECURE_HTTP === 'true',
      });
    } catch (error) {
      console.error('[delivery-worker] processing cycle failed', error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => { void runDeliveries(); }, intervalMs);
  timer.unref();
  void runDeliveries();
  console.log(`[delivery-worker] durable workflow/webhook processing enabled every ${intervalMs}ms`);
});
