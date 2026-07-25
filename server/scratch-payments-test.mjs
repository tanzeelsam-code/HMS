// TEMPORARY verification harness for the payments router — delete after use.
import express from 'express';
import { login, requireAuth } from './auth.js';
import paymentsRoutes, { paymentsWebhookRouter } from './routes/payments.js';

const app = express();
app.use('/api', paymentsWebhookRouter); // raw-body route, before express.json()
app.use(express.json());
app.post('/api/auth/login', login);
app.use('/api', requireAuth, paymentsRoutes);
app.use((err, req, res, next) => {
  res.status(Number.isInteger(err.status) ? err.status : 500).json({ error: err.message });
});
app.listen(4100, () => console.log('[scratch] payments test server on http://localhost:4100'));
