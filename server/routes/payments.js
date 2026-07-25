// routes/payments.js — Stripe payment endpoints.
// Mounted under the authenticated /api chain like the other route modules,
// EXCEPT the webhook sub-router, which Stripe calls without a session and
// which needs the raw request body for signature verification. Mount it
// BEFORE express.json() in index.js:
//
//   import paymentsRoutes, { paymentsWebhookRouter } from './routes/payments.js';
//   app.use('/api', paymentsWebhookRouter);              // before app.use(express.json())
//   // ...inside the authenticated app.use('/api', requireAuth, ...) chain:
//   paymentsRoutes,
import { Router } from 'express';
import express from 'express';
import { db } from '../db.js';
import { requireRoles } from '../auth.js';
import {
  constructWebhookEvent,
  confirmAndPostPayment,
  createPaymentIntent,
  createRefund,
  isPaymentsConfigured,
  paymentsCurrency,
} from '../payments.js';

const r = Router();
const requireFolioRole = requireRoles('General Manager', 'Front Desk', 'Finance');

const routeError = (status, message) => Object.assign(new Error(message), { status });
const assertConfigured = () => {
  if (!isPaymentsConfigured()) {
    throw routeError(503, 'Payments provider not configured — set STRIPE_SECRET_KEY');
  }
};

r.get('/payments/status', (req, res) => {
  // The publishable key is safe to expose to the SPA; the secret key never
  // leaves the server.
  res.json({
    configured: isPaymentsConfigured(),
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY?.trim() || null,
  });
});

r.post('/payments/create-intent', requireFolioRole, async (req, res, next) => {
  try {
    assertConfigured();
    const { reservationId, amountCents } = req.body || {};
    const reservation = typeof reservationId === 'string'
      ? db.prepare('SELECT * FROM reservations WHERE id = ?').get(reservationId.trim())
      : null;
    if (!reservation) throw routeError(404, 'Reservation not found');
    if (!['Confirmed', 'Checked-In'].includes(reservation.status)) {
      throw routeError(409, `The ${reservation.status} reservation folio is closed`);
    }
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw routeError(400, 'amountCents must be a positive integer');
    }
    const balance = db.prepare(
      'SELECT COALESCE(SUM(amount), 0) AS amount FROM folio_items WHERE reservation_id = ?',
    ).get(reservation.id).amount;
    const outstandingCents = Math.round(balance * 100);
    if (outstandingCents <= 0) {
      throw routeError(409, 'Reservation folio has no outstanding balance');
    }
    if (amountCents > outstandingCents) {
      throw routeError(400, `amountCents cannot exceed the outstanding balance (${outstandingCents} cents)`);
    }
    const { clientSecret, paymentIntentId } = await createPaymentIntent({
      amountCents,
      currency: paymentsCurrency(),
      reservationId: reservation.id,
      guestEmail: reservation.guestEmail || undefined,
      description: `Reservation ${reservation.code} folio payment`,
    });
    res.status(201).json({ clientSecret, paymentIntentId, currency: paymentsCurrency() });
  } catch (error) {
    next(error);
  }
});

r.post('/payments/confirm', requireFolioRole, async (req, res, next) => {
  try {
    assertConfigured();
    const { paymentIntentId } = req.body || {};
    const result = await confirmAndPostPayment(paymentIntentId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

r.post('/payments/refund', requireFolioRole, async (req, res, next) => {
  try {
    assertConfigured();
    const { paymentIntentId, amountCents } = req.body || {};
    const result = await createRefund(paymentIntentId, amountCents ?? undefined);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

// Stripe webhooks arrive without a staff session and must be verified with
// the raw body, so this sub-router is exported separately and mounted before
// express.json() (see header comment).
export const paymentsWebhookRouter = Router();
paymentsWebhookRouter.post(
  '/payments/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res, next) => {
    try {
      if (!Buffer.isBuffer(req.body)) {
        throw routeError(400, 'Webhook requires the raw request body — mount paymentsWebhookRouter before express.json()');
      }
      const signature = req.headers['stripe-signature'];
      if (typeof signature !== 'string' || !signature) {
        throw routeError(400, 'Missing stripe-signature header');
      }
      const event = constructWebhookEvent(req.body, signature);
      if (event.type === 'payment_intent.succeeded') {
        const result = await confirmAndPostPayment(event.data.object.id);
        return res.json({ received: true, ...result });
      }
      res.json({ received: true, ignored: event.type });
    } catch (error) {
      next(error);
    }
  },
);

export default r;
