// General-Manager-only account and property-access administration.
//
// Integration prerequisites are intentionally owned by db.js/auth.js:
//   users.active INTEGER NOT NULL DEFAULT 1
//   users.must_change_password INTEGER NOT NULL DEFAULT 0
//   properties and user_property_memberships tables
// This module never selects or serializes password hashes or session tokens.
import crypto from 'node:crypto';
import { Router } from 'express';
import { db as defaultDb } from '../db.js';
import { requireRoles } from '../auth.js';
import { hashPassword } from '../passwords.js';
import { initializeAuditSchema, recordAuditFromRequest } from '../audit.js';

export const ADMIN_ROLES = Object.freeze([
  'General Manager',
  'Front Desk',
  'Housekeeping',
  'Finance',
]);

const ROLE_SET = new Set(ADMIN_ROLES);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PROPERTIES_PER_USER = 100;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

const routeError = (status, message) => Object.assign(new Error(message), { status });

const asyncSafe = (handler) => (req, res, next) => {
  try {
    const result = handler(req, res, next);
    if (result && typeof result.catch === 'function') result.catch(next);
  } catch (error) {
    next(error);
  }
};

const withImmediateTransaction = (database, operation) => {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
};

const normalizeEmail = (value) => {
  if (typeof value !== 'string') throw routeError(400, 'email is required');
  const email = value.normalize('NFKC').trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw routeError(400, 'email must be a valid address of at most 254 characters');
  }
  return email;
};

const normalizeName = (value) => {
  if (typeof value !== 'string') throw routeError(400, 'name is required');
  const name = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw routeError(400, 'name must contain 2-100 printable characters');
  }
  return name;
};

const normalizeRole = (value) => {
  if (typeof value !== 'string' || !ROLE_SET.has(value)) {
    throw routeError(400, `role must be one of: ${ADMIN_ROLES.join(', ')}`);
  }
  return value;
};

const normalizePropertyIds = (value, { allowEmpty = false } = {}) => {
  if (!Array.isArray(value)) throw routeError(400, 'propertyIds must be an array');
  if ((!allowEmpty && value.length === 0) || value.length > MAX_PROPERTIES_PER_USER) {
    throw routeError(400, `propertyIds must contain ${allowEmpty ? '0' : '1'}-${MAX_PROPERTIES_PER_USER} properties`);
  }
  const normalized = value.map((id) => {
    if (typeof id !== 'string' || !id.trim() || id.trim().length > 128) {
      throw routeError(400, 'Every propertyId must be a non-empty string of at most 128 characters');
    }
    return id.trim();
  });
  if (new Set(normalized).size !== normalized.length) {
    throw routeError(400, 'propertyIds cannot contain duplicates');
  }
  return normalized.sort();
};

const assertStrongPassword = (password, user) => {
  if (typeof password !== 'string'
    || password.length < MIN_PASSWORD_LENGTH
    || password.length > MAX_PASSWORD_LENGTH) {
    throw routeError(400, `password must contain ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters`);
  }
  const requiredClasses = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/];
  if (requiredClasses.some((pattern) => !pattern.test(password))) {
    throw routeError(400, 'password must include lowercase, uppercase, number, and symbol characters');
  }
  const lowerPassword = password.toLowerCase();
  if (['password', 'welcome', 'admin123', 'nexushos', 'hotel123'].some((term) => lowerPassword.includes(term))) {
    throw routeError(400, 'password contains a commonly guessed term');
  }
  const personalTokens = [
    user.email?.split('@')[0],
    ...(user.name || '').toLowerCase().split(/[^a-z0-9]+/),
  ].filter((token) => token && token.length >= 4);
  if (personalTokens.some((token) => lowerPassword.includes(token))) {
    throw routeError(400, 'password cannot contain the user name or email identifier');
  }
};

const requireObjectBody = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw routeError(400, 'A JSON object body is required');
  }
  return body;
};

const rejectUnknownFields = (body, allowed) => {
  const unknown = Object.keys(body).filter((field) => !allowed.has(field));
  if (unknown.length) throw routeError(400, `Unknown fields: ${unknown.join(', ')}`);
};

const getUserRow = (database, id) => database.prepare(`
  SELECT id, name, email, role, active, must_change_password
  FROM users WHERE id = ?
`).get(id);

const getMemberships = (database, userId) => database.prepare(`
  SELECT m.property_id, m.role, m.created_at,
         p.code AS property_code, p.name AS property_name, p.status AS property_status
  FROM user_property_memberships m
  JOIN properties p ON p.id = m.property_id
  WHERE m.user_id = ?
  ORDER BY p.name, p.id
`).all(userId);

const stateVersion = (row, memberships) => crypto.createHash('sha256').update(JSON.stringify({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  active: Number(row.active),
  mustChangePassword: Number(row.must_change_password),
  memberships: memberships.map((membership) => [membership.property_id, membership.role]),
})).digest('base64url');

const sanitizeUser = (database, row) => {
  if (!row) return null;
  const memberships = getMemberships(database, row.id);
  const activeSessionCount = Number(database.prepare(
    'SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?',
  ).get(row.id).count);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: !!row.active,
    mustChangePassword: !!row.must_change_password,
    activeSessionCount,
    memberships: memberships.map((membership) => ({
      propertyId: membership.property_id,
      propertyCode: membership.property_code,
      propertyName: membership.property_name,
      propertyStatus: membership.property_status,
      role: membership.role,
      createdAt: membership.created_at,
    })),
    version: stateVersion(row, memberships),
  };
};

const listSanitizedUsers = (database) => database.prepare(`
  SELECT id, name, email, role, active, must_change_password
  FROM users
  ORDER BY active DESC, name COLLATE NOCASE, id
`).all().map((row) => sanitizeUser(database, row));

const assertVersion = (database, row, suppliedVersion) => {
  if (typeof suppliedVersion !== 'string' || !suppliedVersion) {
    throw routeError(428, 'ifVersion is required; refresh the user record before changing it');
  }
  const current = stateVersion(row, getMemberships(database, row.id));
  if (current !== suppliedVersion) {
    throw routeError(409, 'This account changed after it was loaded. Refresh and review before retrying.');
  }
};

const assertEmailAvailable = (database, email, excludeId = null) => {
  const conflict = database.prepare(`
    SELECT id FROM users
    WHERE lower(trim(email)) = ? AND (? IS NULL OR id != ?)
    LIMIT 1
  `).get(email, excludeId, excludeId);
  if (conflict) throw routeError(409, 'Another account already uses this email address');
};

const requireTargetUser = (database, id) => {
  const row = getUserRow(database, id);
  if (!row) throw routeError(404, 'User not found');
  return row;
};

const activeGeneralManagerCount = (database) => Number(database.prepare(`
  SELECT COUNT(*) AS count FROM users
  WHERE role = 'General Manager' AND active = 1
`).get().count);

const assertCanRemoveGeneralManager = (database, target) => {
  if (target.role === 'General Manager' && target.active && activeGeneralManagerCount(database) <= 1) {
    throw routeError(409, 'The last active General Manager cannot be disabled or demoted');
  }
};

const assertActiveProperties = (database, propertyIds) => {
  if (propertyIds.length === 0) return [];
  const placeholders = propertyIds.map(() => '?').join(', ');
  const properties = database.prepare(`
    SELECT id, code, name, status FROM properties
    WHERE id IN (${placeholders}) AND status = 'Active'
    ORDER BY id
  `).all(...propertyIds);
  if (properties.length !== propertyIds.length) {
    throw routeError(400, 'Every propertyId must identify an active property');
  }
  return properties;
};

const replaceMemberships = (database, user, propertyIds) => {
  assertActiveProperties(database, propertyIds);
  database.prepare('DELETE FROM user_property_memberships WHERE user_id = ?').run(user.id);
  const insert = database.prepare(`
    INSERT INTO user_property_memberships (user_id, property_id, role, created_at)
    VALUES (?, ?, ?, ?)
  `);
  const now = new Date().toISOString();
  for (const propertyId of propertyIds) insert.run(user.id, propertyId, user.role, now);
};

const configuredAuditSecret = (value) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') >= 32;

export function createAdminRouter({
  database = defaultDb,
  auditSecret = process.env.NEXUSHOS_AUDIT_HMAC_SECRET,
} = {}) {
  const router = Router();
  const requireGeneralManager = requireRoles('General Manager');
  const auditEnabled = configuredAuditSecret(auditSecret);
  if (auditEnabled) initializeAuditSchema(database);

  const appendAudit = (req, event) => {
    if (!auditEnabled) return;
    recordAuditFromRequest(req, {
      ...event,
      source: 'admin-api',
    }, {
      database,
      secret: auditSecret,
      manageTransaction: false,
    });
  };

  router.use(requireGeneralManager);

  router.get('/admin/users', (_req, res) => {
    res.json(listSanitizedUsers(database));
  });

  router.get('/admin/properties', (_req, res) => {
    const properties = database.prepare(`
      SELECT id, organization_id, code, name, timezone, currency, locale,
             total_rooms, status
      FROM properties
      ORDER BY status = 'Active' DESC, name COLLATE NOCASE, id
    `).all();
    res.json(properties.map((property) => ({
      id: property.id,
      organizationId: property.organization_id,
      code: property.code,
      name: property.name,
      timezone: property.timezone,
      currency: property.currency,
      locale: property.locale,
      totalRooms: Number(property.total_rooms),
      status: property.status,
    })));
  });

  router.post('/admin/users', asyncSafe((req, res) => {
    const body = requireObjectBody(req.body);
    rejectUnknownFields(body, new Set(['name', 'email', 'role', 'password', 'propertyIds']));
    const name = normalizeName(body.name);
    const email = normalizeEmail(body.email);
    const role = normalizeRole(body.role);
    const propertyIds = normalizePropertyIds(body.propertyIds);
    assertStrongPassword(body.password, { name, email });

    const id = `usr-${crypto.randomUUID()}`;
    const created = withImmediateTransaction(database, () => {
      assertEmailAvailable(database, email);
      assertActiveProperties(database, propertyIds);
      database.prepare(`
        INSERT INTO users (id, name, email, password, role, active, must_change_password)
        VALUES (?, ?, ?, ?, ?, 1, 1)
      `).run(id, name, email, hashPassword(body.password), role);
      replaceMemberships(database, { id, role }, propertyIds);
      appendAudit(req, {
        action: 'admin.user.created',
        resourceType: 'user',
        resourceId: id,
        metadata: { role, propertyIds },
      });
      return sanitizeUser(database, getUserRow(database, id));
    });
    res.status(201).json(created);
  }));

  router.patch('/admin/users/:id', asyncSafe((req, res) => {
    const body = requireObjectBody(req.body);
    rejectUnknownFields(body, new Set(['ifVersion', 'name', 'email', 'role']));
    if (!Object.hasOwn(body, 'name') && !Object.hasOwn(body, 'email') && !Object.hasOwn(body, 'role')) {
      throw routeError(400, 'At least one of name, email, or role is required');
    }

    const updated = withImmediateTransaction(database, () => {
      const target = requireTargetUser(database, req.params.id);
      assertVersion(database, target, body.ifVersion);
      const name = Object.hasOwn(body, 'name') ? normalizeName(body.name) : target.name;
      const email = Object.hasOwn(body, 'email') ? normalizeEmail(body.email) : target.email;
      const role = Object.hasOwn(body, 'role') ? normalizeRole(body.role) : target.role;
      if (target.id === req.user.id && (role !== target.role || email !== target.email)) {
        throw routeError(409, 'Use the personal account flow to change your own role or sign-in email');
      }
      if (target.role === 'General Manager' && role !== 'General Manager') {
        assertCanRemoveGeneralManager(database, target);
      }
      assertEmailAvailable(database, email, target.id);
      database.prepare('UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?')
        .run(name, email, role, target.id);
      if (role !== target.role) {
        database.prepare('UPDATE user_property_memberships SET role = ? WHERE user_id = ?')
          .run(role, target.id);
      }
      const revokeSessions = role !== target.role || email !== target.email;
      if (revokeSessions) database.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
      const changedFields = [
        ...(name !== target.name ? ['name'] : []),
        ...(email !== target.email ? ['email'] : []),
        ...(role !== target.role ? ['role'] : []),
      ];
      appendAudit(req, {
        action: 'admin.user.updated',
        resourceType: 'user',
        resourceId: target.id,
        metadata: { changedFields, previousRole: target.role, role, sessionsRevoked: revokeSessions },
      });
      return sanitizeUser(database, getUserRow(database, target.id));
    });
    res.json(updated);
  }));

  router.post('/admin/users/:id/disable', asyncSafe((req, res) => {
    const body = requireObjectBody(req.body);
    rejectUnknownFields(body, new Set(['ifVersion']));
    const result = withImmediateTransaction(database, () => {
      const target = requireTargetUser(database, req.params.id);
      assertVersion(database, target, body.ifVersion);
      if (target.id === req.user.id) throw routeError(409, 'You cannot disable your own account');
      if (!target.active) throw routeError(409, 'User is already disabled');
      assertCanRemoveGeneralManager(database, target);
      database.prepare('UPDATE users SET active = 0 WHERE id = ?').run(target.id);
      const revokedSessions = Number(database.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id).changes);
      appendAudit(req, {
        action: 'admin.user.disabled',
        resourceType: 'user',
        resourceId: target.id,
        metadata: { role: target.role, revokedSessions },
      });
      return { user: sanitizeUser(database, getUserRow(database, target.id)), revokedSessions };
    });
    res.json(result);
  }));

  router.post('/admin/users/:id/reactivate', asyncSafe((req, res) => {
    const body = requireObjectBody(req.body);
    rejectUnknownFields(body, new Set(['ifVersion']));
    const user = withImmediateTransaction(database, () => {
      const target = requireTargetUser(database, req.params.id);
      assertVersion(database, target, body.ifVersion);
      if (target.active) throw routeError(409, 'User is already active');
      const membershipCount = Number(database.prepare(`
        SELECT COUNT(*) AS count
        FROM user_property_memberships m
        JOIN properties p ON p.id = m.property_id
        WHERE m.user_id = ? AND p.status = 'Active'
      `).get(target.id).count);
      if (membershipCount === 0) {
        throw routeError(409, 'Assign at least one active property before reactivating this user');
      }
      database.prepare('UPDATE users SET active = 1 WHERE id = ?').run(target.id);
      appendAudit(req, {
        action: 'admin.user.reactivated',
        resourceType: 'user',
        resourceId: target.id,
        metadata: { role: target.role },
      });
      return sanitizeUser(database, getUserRow(database, target.id));
    });
    res.json(user);
  }));

  router.post([
    '/admin/users/:id/reset-password',
    '/admin/users/:id/rotate-password',
  ], asyncSafe((req, res) => {
    const body = requireObjectBody(req.body);
    rejectUnknownFields(body, new Set(['ifVersion', 'newPassword']));
    const result = withImmediateTransaction(database, () => {
      const target = requireTargetUser(database, req.params.id);
      assertVersion(database, target, body.ifVersion);
      if (target.id === req.user.id) {
        throw routeError(409, 'Use the personal change-password flow for your own account');
      }
      assertStrongPassword(body.newPassword, target);
      database.prepare(`
        UPDATE users SET password = ?, must_change_password = 1 WHERE id = ?
      `).run(hashPassword(body.newPassword), target.id);
      const revokedSessions = Number(database.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id).changes);
      appendAudit(req, {
        action: 'admin.user.password_reset',
        resourceType: 'user',
        resourceId: target.id,
        metadata: { revokedSessions, mustChangePassword: true },
      });
      return { user: sanitizeUser(database, getUserRow(database, target.id)), revokedSessions };
    });
    res.json(result);
  }));

  router.post('/admin/users/:id/revoke-sessions', asyncSafe((req, res) => {
    const body = requireObjectBody(req.body);
    rejectUnknownFields(body, new Set(['ifVersion']));
    const result = withImmediateTransaction(database, () => {
      const target = requireTargetUser(database, req.params.id);
      assertVersion(database, target, body.ifVersion);
      if (target.id === req.user.id) {
        throw routeError(409, 'You cannot revoke your own current administration session');
      }
      const revokedSessions = Number(database.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id).changes);
      appendAudit(req, {
        action: 'admin.user.sessions_revoked',
        resourceType: 'user',
        resourceId: target.id,
        metadata: { revokedSessions },
      });
      return { user: sanitizeUser(database, getUserRow(database, target.id)), revokedSessions };
    });
    res.json(result);
  }));

  router.patch('/admin/users/:id/memberships', asyncSafe((req, res) => {
    const body = requireObjectBody(req.body);
    rejectUnknownFields(body, new Set(['ifVersion', 'propertyIds']));
    const propertyIds = normalizePropertyIds(body.propertyIds);
    const user = withImmediateTransaction(database, () => {
      const target = requireTargetUser(database, req.params.id);
      assertVersion(database, target, body.ifVersion);
      const previousIds = getMemberships(database, target.id).map((membership) => membership.property_id);
      replaceMemberships(database, target, propertyIds);
      appendAudit(req, {
        action: 'admin.user.memberships_updated',
        resourceType: 'user',
        resourceId: target.id,
        metadata: {
          addedPropertyIds: propertyIds.filter((id) => !previousIds.includes(id)),
          removedPropertyIds: previousIds.filter((id) => !propertyIds.includes(id)),
        },
      });
      return sanitizeUser(database, getUserRow(database, target.id));
    });
    res.json(user);
  }));

  return router;
}

const adminRoutes = createAdminRouter();
export default adminRoutes;
