// auth.js — login endpoint + bearer-token middleware (sessions in DB).
import crypto from 'node:crypto';
import { db } from './db.js';

export function login(req, res) {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND password = ?').get(email, password);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });
  const token = crypto.randomUUID();
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)')
    .run(token, user.id, new Date().toISOString());
  res.json({ token, user: { name: user.name, role: user.role, email: user.email } });
}

export function requireAuth(req, res, next) {
  if (req.path === '/auth/login') return next();
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing Authorization: Bearer <token>' });
  const session = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token);
  if (!session) return res.status(401).json({ error: 'Invalid or expired token' });
  req.user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(session.user_id);
  next();
}
