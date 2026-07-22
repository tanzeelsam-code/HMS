// Production-oriented HTTP security primitives for the NexusHOS API.
//
// These helpers deliberately use SQLite instead of process-local Maps so rate
// limits remain consistent when more than one API process shares the database.
// For a geographically distributed deployment, use the same middleware shape
// with a centralized/edge rate-limit store.
import crypto from 'node:crypto';
import { db as defaultDb } from './db.js';

export const SECURITY_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS api_rate_limit_buckets (
  scope TEXT NOT NULL,
  bucket_key TEXT NOT NULL,
  window_start_ms INTEGER NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count >= 0),
  expires_at_ms INTEGER NOT NULL,
  PRIMARY KEY (scope, bucket_key)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_api_rate_limit_buckets_expiry
  ON api_rate_limit_buckets (expires_at_ms);
`;

const DEFAULT_ROLE_SCOPES = Object.freeze({
  'General Manager': Object.freeze(['platform:*']),
  Finance: Object.freeze(['platform:audit:read']),
  'Front Desk': Object.freeze([]),
  Housekeeping: Object.freeze([]),
});

const normalizeHeaderValue = (value) => Array.isArray(value) ? value[0] : value;

const clientAddress = (req) => {
  // req.ip honors Express's configured `trust proxy` policy. Do not enable
  // `trust proxy` broadly; configure it only for known reverse proxies.
  const value = req.ip || req.socket?.remoteAddress || 'unknown';
  return String(value).slice(0, 256);
};

const normalizeEmail = (value) => typeof value === 'string'
  ? value.trim().toLowerCase().slice(0, 320)
  : '<missing-email>';

const digestBucketKey = (value, pepper) => {
  const input = String(value);
  return pepper
    ? crypto.createHmac('sha256', pepper).update(input).digest('hex')
    : crypto.createHash('sha256').update(input).digest('hex');
};

const scopeMatches = (granted, required) => granted === '*'
  || granted === required
  || (granted.endsWith('*') && required.startsWith(granted.slice(0, -1)));

export function initializeSecuritySchema(database = defaultDb) {
  database.exec(SECURITY_SCHEMA_SQL);
}

/**
 * Adds a server-generated request ID and conservative API response headers.
 * Mount before routes. When mounted globally, set `noStore: false` if the same
 * Express process also serves intentionally cacheable public assets.
 */
export function createSecurityMiddleware({
  noStore = true,
  hsts = true,
  hstsMaxAgeSeconds = 31_536_000,
} = {}) {
  return (req, res, next) => {
    const requestId = crypto.randomUUID();
    req.id = requestId;
    res.locals.requestId = requestId;

    // Keep a syntactically safe caller correlation value for logs only. It is
    // never reflected as the authoritative server request ID.
    const callerRequestId = normalizeHeaderValue(req.headers['x-request-id']);
    if (typeof callerRequestId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(callerRequestId)) {
      req.callerRequestId = callerRequestId;
    }

    res.setHeader('X-Request-ID', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    if (noStore) res.setHeader('Cache-Control', 'no-store');
    if (hsts && req.secure) {
      res.setHeader('Strict-Transport-Security', `max-age=${hstsMaxAgeSeconds}; includeSubDomains`);
    }
    res.removeHeader('X-Powered-By');
    next();
  };
}

/**
 * Fixed-window SQLite rate limiter. Rejected requests continue incrementing the
 * current bucket, while the expiry remains fixed from its first request.
 */
export function createSqliteRateLimiter({
  database = defaultDb,
  scope,
  limit,
  windowMs,
  keyGenerator = clientAddress,
  keyPepper = process.env.NEXUSHOS_RATE_LIMIT_PEPPER,
  skip = (req) => req.method === 'OPTIONS',
  cleanupProbability = 0.01,
} = {}) {
  if (typeof scope !== 'string' || !/^[a-z0-9._:-]{1,80}$/i.test(scope)) {
    throw new TypeError('Rate limiter scope must contain 1-80 safe characters');
  }
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError('Rate limiter limit must be a positive integer');
  if (!Number.isInteger(windowMs) || windowMs < 1_000) {
    throw new TypeError('Rate limiter windowMs must be an integer of at least 1000');
  }
  if (typeof keyGenerator !== 'function') throw new TypeError('Rate limiter keyGenerator must be a function');

  initializeSecuritySchema(database);
  const consume = database.prepare(`
    INSERT INTO api_rate_limit_buckets
      (scope, bucket_key, window_start_ms, request_count, expires_at_ms)
    VALUES (?, ?, ?, 1, ?)
    ON CONFLICT (scope, bucket_key) DO UPDATE SET
      window_start_ms = CASE
        WHEN api_rate_limit_buckets.expires_at_ms <= excluded.window_start_ms
        THEN excluded.window_start_ms ELSE api_rate_limit_buckets.window_start_ms END,
      request_count = CASE
        WHEN api_rate_limit_buckets.expires_at_ms <= excluded.window_start_ms
        THEN 1 ELSE api_rate_limit_buckets.request_count + 1 END,
      expires_at_ms = CASE
        WHEN api_rate_limit_buckets.expires_at_ms <= excluded.window_start_ms
        THEN excluded.expires_at_ms ELSE api_rate_limit_buckets.expires_at_ms END
    RETURNING request_count, expires_at_ms
  `);
  const cleanup = database.prepare('DELETE FROM api_rate_limit_buckets WHERE expires_at_ms <= ?');

  return (req, res, next) => {
    try {
      if (skip?.(req)) return next();
      const rawKey = keyGenerator(req);
      if (rawKey == null || rawKey === '') {
        return next(Object.assign(new Error(`Unable to derive rate-limit key for ${scope}`), { status: 500 }));
      }

      const now = Date.now();
      const bucket = consume.get(
        scope,
        digestBucketKey(rawKey, keyPepper),
        now,
        now + windowMs,
      );
      if (Math.random() < cleanupProbability) cleanup.run(now);

      const remaining = Math.max(0, limit - Number(bucket.request_count));
      const resetSeconds = Math.max(1, Math.ceil((Number(bucket.expires_at_ms) - now) / 1000));
      res.setHeader('RateLimit-Limit', String(limit));
      res.setHeader('RateLimit-Remaining', String(remaining));
      res.setHeader('RateLimit-Reset', String(resetSeconds));

      if (Number(bucket.request_count) > limit) {
        res.setHeader('Retry-After', String(resetSeconds));
        return res.status(429).json({
          error: 'Too many requests',
          retryAfterSeconds: resetSeconds,
          requestId: req.id,
        });
      }
      next();
    } catch (error) {
      // Fail closed: an unavailable limiter should not silently remove the
      // protection from login or privileged API routes.
      next(error);
    }
  };
}

/**
 * Two-dimensional login throttling: one wider bucket per source address and a
 * tighter bucket per source-address/account pair. Mount both before `login`.
 */
export function createLoginRateLimiters({
  database = defaultDb,
  windowMs = 15 * 60 * 1000,
  perAddressLimit = 60,
  perAccountAndAddressLimit = 10,
  keyPepper = process.env.NEXUSHOS_RATE_LIMIT_PEPPER,
} = {}) {
  return [
    createSqliteRateLimiter({
      database,
      scope: 'auth.login.ip',
      limit: perAddressLimit,
      windowMs,
      keyPepper,
      keyGenerator: clientAddress,
    }),
    createSqliteRateLimiter({
      database,
      scope: 'auth.login.ip_account',
      limit: perAccountAndAddressLimit,
      windowMs,
      keyPepper,
      keyGenerator: (req) => `${clientAddress(req)}\0${normalizeEmail(req.body?.email)}`,
    }),
  ];
}

export function createApiRateLimiter({
  database = defaultDb,
  windowMs = 60_000,
  perActorLimit = 600,
  keyPepper = process.env.NEXUSHOS_RATE_LIMIT_PEPPER,
} = {}) {
  return createSqliteRateLimiter({
    database,
    scope: 'api.authenticated.actor',
    limit: perActorLimit,
    windowMs,
    keyPepper,
    keyGenerator: (req) => req.user?.id || clientAddress(req),
  });
}

export function grantedScopesFor(req, roleScopes = DEFAULT_ROLE_SCOPES) {
  if (Array.isArray(req.user?.scopes)) {
    return req.user.scopes.filter((scope) => typeof scope === 'string');
  }
  return roleScopes[req.user?.role] || [];
}

/**
 * Scope middleware that works with future API principals (`req.user.scopes`)
 * while retaining a conservative role-to-scope bridge for today's users.
 */
export function requireScopes(...requiredScopes) {
  if (requiredScopes.length === 0 || requiredScopes.some((scope) => typeof scope !== 'string')) {
    throw new TypeError('requireScopes needs one or more string scopes');
  }
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required', requestId: req.id });
    const granted = grantedScopesFor(req);
    const missing = requiredScopes.filter(
      (required) => !granted.some((scope) => scopeMatches(scope, required)),
    );
    if (missing.length > 0) {
      return res.status(403).json({ error: 'Insufficient platform scope', requestId: req.id });
    }
    next();
  };
}

export { DEFAULT_ROLE_SCOPES };
