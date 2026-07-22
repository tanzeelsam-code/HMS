// auth.js — database-backed sessions for the browser and partner API clients.
import crypto from 'node:crypto';
import { db, tx } from './db.js';
import { hashPassword, verifyPassword } from './passwords.js';

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const SESSION_COOKIE = 'nexushos_session';
const DUMMY_PASSWORD_HASH = hashPassword('nexushos-invalid-account-timing-guard');

const getBearerToken = (req) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
};

const getCookieToken = (req) => {
  const cookieHeader = req.headers.cookie || '';
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName !== SESSION_COOKIE) continue;
    try {
      return decodeURIComponent(rawValue.join('=')) || null;
    } catch {
      return null;
    }
  }
  return null;
};

const sessionCookie = (token, maxAgeSeconds) => [
  `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
  'Path=/',
  'HttpOnly',
  'SameSite=Strict',
  `Max-Age=${maxAgeSeconds}`,
  ...(process.env.NODE_ENV === 'production' ? ['Secure'] : []),
].join('; ');

const clearExpiredSessions = () => {
  db.prepare('DELETE FROM sessions WHERE created_at IS NULL OR created_at <= ?')
    .run(new Date(Date.now() - SESSION_TTL_MS).toISOString());
};

export async function login(req, res) {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const user = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email.trim());
  const passwordValid = await verifyPassword(password, user?.password || DUMMY_PASSWORD_HASH);
  if (!user || !passwordValid || !user.active) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const now = new Date();
  const token = crypto.randomBytes(32).toString('base64url');
  clearExpiredSessions();
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)')
    .run(token, user.id, now.toISOString());
  res.setHeader('Set-Cookie', sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000)));
  req.user = {
    id: user.id,
    name: user.name,
    role: user.role,
    email: user.email,
    mustChangePassword: !!user.must_change_password,
  };
  res.json({
    // Bearer tokens remain available for CLI/integration clients. The browser
    // deliberately ignores this value and relies on the HttpOnly cookie.
    token,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
    user: {
      name: user.name,
      role: user.role,
      email: user.email,
      mustChangePassword: !!user.must_change_password,
    },
  });
}

export function requireAuth(req, res, next) {
  clearExpiredSessions();
  const bearerToken = getBearerToken(req);
  const cookieToken = getCookieToken(req);
  const token = bearerToken || cookieToken;
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  const session = db.prepare(`
    SELECT s.user_id, s.created_at, u.name, u.email, u.role,
      u.active, u.must_change_password
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ?`).get(token);
  const createdAt = session ? Date.parse(session.created_at) : NaN;
  const age = Date.now() - createdAt;
  if (!session || !session.active || !Number.isFinite(createdAt) || age < 0 || age >= SESSION_TTL_MS) {
    if (session) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.authToken = token;
  req.authMethod = bearerToken ? 'bearer' : 'cookie';
  req.user = {
    id: session.user_id,
    name: session.name,
    email: session.email,
    role: session.role,
    mustChangePassword: !!session.must_change_password,
  };
  next();
}

export function logout(req, res) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.authToken);
  res.setHeader('Set-Cookie', sessionCookie('', 0));
  res.status(204).end();
}

export function currentSession(req, res) {
  res.json({ user: req.user });
}

const passwordPolicyError = (message) => Object.assign(new Error(message), { status: 400 });

const assertStrongPassword = (password, user) => {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw passwordPolicyError('newPassword must contain 12-128 characters');
  }
  if ([/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].some((pattern) => !pattern.test(password))) {
    throw passwordPolicyError('newPassword must include lowercase, uppercase, number, and symbol characters');
  }
  const lowerPassword = password.toLowerCase();
  if (['password', 'welcome', 'admin123', 'nexushos', 'hotel123'].some((term) => lowerPassword.includes(term))) {
    throw passwordPolicyError('newPassword contains a commonly guessed term');
  }
  const personalTokens = [
    user.email?.split('@')[0],
    ...(user.name || '').toLowerCase().split(/[^a-z0-9]+/),
  ].filter((token) => token && token.length >= 4);
  if (personalTokens.some((token) => lowerPassword.includes(token))) {
    throw passwordPolicyError('newPassword cannot contain your name or email identifier');
  }
};

export async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || !currentPassword) {
      throw passwordPolicyError('currentPassword is required');
    }
    const user = db.prepare(`
      SELECT id, name, email, password, role, active, must_change_password
      FROM users WHERE id = ?
    `).get(req.user.id);
    if (!user?.active || !await verifyPassword(currentPassword, user?.password || DUMMY_PASSWORD_HASH)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    assertStrongPassword(newPassword, user);
    if (await verifyPassword(newPassword, user.password)) {
      throw passwordPolicyError('newPassword must be different from the current password');
    }

    const nextHash = hashPassword(newPassword);
    const otherSessionsRevoked = tx(() => {
      db.prepare('UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?')
        .run(nextHash, user.id);
      return Number(db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?')
        .run(user.id, req.authToken).changes);
    });
    req.user.mustChangePassword = false;
    return res.json({
      user: {
        name: user.name,
        role: user.role,
        email: user.email,
        mustChangePassword: false,
      },
      otherSessionsRevoked,
    });
  } catch (error) {
    return next(error);
  }
}

export function requirePasswordChangeComplete(req, res, next) {
  if (req.user?.mustChangePassword) {
    return res.status(403).json({
      error: 'Password change required before using the application',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
  }
  next();
}

export const requireRoles = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: `This action requires one of these roles: ${roles.join(', ')}` });
  }
  next();
};
