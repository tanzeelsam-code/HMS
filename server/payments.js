// payments.js — Stripe payment gateway integration.
// All configuration comes from the environment. When STRIPE_SECRET_KEY is
// absent the module stays inert: isPaymentsConfigured() returns false and the
// API layer answers with a clean 503 "provider not configured" state instead
// of failing at boot (see PRODUCT_ROADMAP.md, external prerequisites).
import Stripe from 'stripe';
import { db, tx, uid, today } from './db.js';
import { postFolioJournal, toMoney } from './accounting.js';

const routeError = (status, message) => Object.assign(new Error(message), { status });

export const isPaymentsConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY?.trim());

export const paymentsCurrency = () => (process.env.HMS_CURRENCY?.trim() || 'usd').toLowerCase();

let stripeClient = null;
const getStripe = () => {
  if (!isPaymentsConfigured()) {
    throw routeError(503, 'Payments provider not configured — set STRIPE_SECRET_KEY');
  }
  if (!stripeClient) stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY.trim());
  return stripeClient;
};

// Exposed for routes/payments.js webhook signature verification.
export const constructWebhookEvent = (rawBody, signature) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw routeError(503, 'Stripe webhook secret not configured — set STRIPE_WEBHOOK_SECRET');
  }
  try {
    return getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    throw routeError(400, 'Invalid Stripe webhook signature');
  }
};

const assertAmountCents = (amountCents) => {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw routeError(400, 'amountCents must be a positive integer (amount in minor currency units)');
  }
  return amountCents;
};

export async function createPaymentIntent({ amountCents, currency, reservationId, guestEmail, description }) {
  const amount = assertAmountCents(amountCents);
  const paymentIntent = await getStripe().paymentIntents.create({
    amount,
    currency: (currency || paymentsCurrency()).toLowerCase(),
    ...(guestEmail ? { receipt_email: guestEmail } : {}),
    ...(description ? { description } : {}),
    metadata: { reservationId: String(reservationId) },
    automatic_payment_methods: { enabled: true },
  });
  return { clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id };
}

// The Stripe PaymentIntent is the source of truth — the client is never
// trusted. Posting is idempotent on the exact folio description so retries
// and webhook/confirm double-delivery cannot post the same payment twice.
export async function confirmAndPostPayment(paymentIntentId) {
  if (typeof paymentIntentId !== 'string' || !paymentIntentId.trim()) {
    throw routeError(400, 'paymentIntentId is required');
  }
  const id = paymentIntentId.trim();
  const paymentIntent = await getStripe().paymentIntents.retrieve(id);
  if (paymentIntent.status !== 'succeeded') {
    throw routeError(409, `PaymentIntent ${id} has not succeeded (status: ${paymentIntent.status})`);
  }
  const reservationId = paymentIntent.metadata?.reservationId;
  const reservation = reservationId
    ? db.prepare('SELECT * FROM reservations WHERE id = ?').get(reservationId)
    : null;
  if (!reservation) {
    throw routeError(404, `No reservation found for PaymentIntent ${id}`);
  }
  const description = `Stripe Payment ${paymentIntent.id}`;
  const amountCents = paymentIntent.amount_received ?? paymentIntent.amount;
  const amount = toMoney(-amountCents / 100);
  return tx(() => {
    const existing = db.prepare(
      'SELECT * FROM folio_items WHERE reservation_id = ? AND description = ?',
    ).get(reservation.id, description);
    if (existing) return { posted: false, folioItem: existing };
    const folioItemId = uid('f');
    db.prepare(`
      INSERT INTO folio_items (id, reservation_id, date, description, category, amount, postedBy)
      VALUES (?, ?, ?, ?, 'Payment', ?, 'Stripe Gateway')
    `).run(folioItemId, reservation.id, today(), description, amount);
    // Mirror the manual Payment path in routes/core.js: negative folio lines
    // increase paidAmount and produce a Cash/AR journal entry.
    db.prepare('UPDATE reservations SET paidAmount = MAX(0, paidAmount - ?) WHERE id = ?')
      .run(amount, reservation.id);
    postFolioJournal({
      folioItemId,
      date: today(),
      description: `${description} (${reservation.guestName}, room ${reservation.roomNumber})`,
      source: 'Stripe Gateway',
      category: 'Payment',
      amount,
    });
    return {
      posted: true,
      folioItem: db.prepare('SELECT * FROM folio_items WHERE id = ?').get(folioItemId),
    };
  });
}

export async function createRefund(paymentIntentId, amountCents) {
  if (typeof paymentIntentId !== 'string' || !paymentIntentId.trim()) {
    throw routeError(400, 'paymentIntentId is required');
  }
  if (amountCents != null) assertAmountCents(amountCents);
  const refund = await getStripe().refunds.create({
    payment_intent: paymentIntentId.trim(),
    ...(amountCents != null ? { amount: amountCents } : {}),
  });
  return { refundId: refund.id, status: refund.status, amountCents: refund.amount };
}
