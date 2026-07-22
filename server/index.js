// index.js — AuraHMS local backend entry point (port 4000).
import express from 'express';
import { login, requireAuth } from './auth.js';
import coreRoutes from './routes/core.js';
import erpRoutes from './routes/erp.js';
import aiRoutes from './routes/ai.js';
import { DB_PATH } from './db.js';

const app = express();
app.use(express.json());

// Harmless permissive CORS for direct calls (vite proxy is the intended path).
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.post('/api/auth/login', login);
app.use('/api', requireAuth, coreRoutes, erpRoutes, aiRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: `Not found: ${req.method} ${req.path}` }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`[server] AuraHMS API listening on http://localhost:${PORT} (db: ${DB_PATH})`);
});
