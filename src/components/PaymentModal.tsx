import React, { useEffect, useRef, useState } from 'react';
import { Reservation } from '../types';
import { api } from '../api';
import { X, CreditCard, ShieldAlert, CheckCircle2, Loader2 } from 'lucide-react';

interface StripeCardElement {
  mount: (element: HTMLElement) => void;
  unmount: () => void;
  destroy: () => void;
}
interface StripeElements {
  create: (type: 'card', options?: Record<string, unknown>) => StripeCardElement;
}
interface StripeInstance {
  elements: () => StripeElements;
  confirmCardPayment: (
    clientSecret: string,
    data: { payment_method: { card: StripeCardElement } },
  ) => Promise<{
    error?: { message?: string };
    paymentIntent?: { id: string; status: string };
  }>;
}
declare global {
  interface Window {
    Stripe?: (publishableKey: string) => StripeInstance;
  }
}

const loadStripeJs = (): Promise<NonNullable<Window['Stripe']>> => new Promise((resolve, reject) => {
  if (window.Stripe) return resolve(window.Stripe);
  const existing = document.querySelector<HTMLScriptElement>('script[data-nexushos-stripe]');
  if (existing) {
    existing.addEventListener('load', () => window.Stripe
      ? resolve(window.Stripe)
      : reject(new Error('Stripe.js failed to initialize')));
    existing.addEventListener('error', () => reject(new Error('Unable to load Stripe.js')));
    return;
  }
  const script = document.createElement('script');
  script.src = 'https://js.stripe.com/v3';
  script.async = true;
  script.dataset.nexushosStripe = 'true';
  script.onload = () => window.Stripe
    ? resolve(window.Stripe)
    : reject(new Error('Stripe.js failed to initialize'));
  script.onerror = () => reject(new Error('Unable to load Stripe.js'));
  document.head.appendChild(script);
});

interface PaymentsStatus {
  configured: boolean;
  publishableKey: string | null;
}

interface PaymentModalProps {
  reservation: Reservation;
  onClose: () => void;
  onPosted: () => void;
}

type Phase = 'loading' | 'amount' | 'card' | 'processing' | 'done';

export const PaymentModal: React.FC<PaymentModalProps> = ({ reservation, onClose, onPosted }) => {
  const balance = Math.round(
    reservation.folioItems.reduce((sum, item) => sum + item.amount, 0) * 100,
  ) / 100;

  const [status, setStatus] = useState<PaymentsStatus | null>(null);
  const [statusError, setStatusError] = useState('');
  const [amount, setAmount] = useState(balance > 0 ? balance.toFixed(2) : '');
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const cardHostRef = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<{
    stripe: StripeInstance;
    card: StripeCardElement;
    clientSecret: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<PaymentsStatus>('/payments/status')
      .then((result) => {
        if (cancelled) return;
        setStatus(result);
        setPhase('amount');
      })
      .catch((err) => {
        if (!cancelled) setStatusError(err instanceof Error ? err.message : 'Unable to load payments status');
      });
    return () => {
      cancelled = true;
      stripeRef.current?.card.destroy();
      stripeRef.current = null;
    };
  }, []);

  const parsedAmountCents = Math.round(Number(amount) * 100);
  const amountValid = Number.isInteger(parsedAmountCents)
    && parsedAmountCents > 0
    && parsedAmountCents <= Math.round(balance * 100);

  const handleCreateIntent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!status?.publishableKey) {
      setError('Stripe publishable key is missing — set STRIPE_PUBLISHABLE_KEY.');
      return;
    }
    if (!amountValid) {
      setError(`Enter an amount between 0.01 and ${balance.toFixed(2)}.`);
      return;
    }
    setPhase('processing');
    setError('');
    try {
      const { clientSecret } = await api.post<{ clientSecret: string }>('/payments/create-intent', {
        reservationId: reservation.id,
        amountCents: parsedAmountCents,
      });
      const stripeFactory = await loadStripeJs();
      const stripe = stripeFactory(status.publishableKey);
      const card = stripe.elements().create('card', {
        style: {
          base: {
            color: '#0f172a',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '15px',
            '::placeholder': { color: '#64748b' },
          },
          invalid: { color: '#e11d48' },
        },
      });
      stripeRef.current = { stripe, card, clientSecret };
      setPhase('card');
      requestAnimationFrame(() => {
        if (cardHostRef.current) card.mount(cardHostRef.current);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start the payment.');
      setPhase('amount');
    }
  };

  const handleConfirmPayment = async () => {
    const active = stripeRef.current;
    if (!active) return;
    setPhase('processing');
    setError('');
    try {
      const result = await active.stripe.confirmCardPayment(active.clientSecret, {
        payment_method: { card: active.card },
      });
      if (result.error) {
        throw new Error(result.error.message || 'The card was declined.');
      }
      if (result.paymentIntent?.status !== 'succeeded') {
        throw new Error(`Payment did not complete (status: ${result.paymentIntent?.status || 'unknown'})`);
      }
      await api.post('/payments/confirm', { paymentIntentId: result.paymentIntent.id });
      setPhase('done');
      onPosted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to confirm the payment.');
      setPhase('card');
    }
  };

  const notConfigured = status !== null && !status.configured;

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-4 animate-slide-up">
      <div
        className="surface-panel bg-white w-full max-w-md p-6 space-y-5 border border-slate-200 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-dialog-title"
      >
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h3 id="payment-dialog-title" className="text-lg font-bold text-slate-900">Take Card Payment</h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {reservation.guestName} • {reservation.code} • Outstanding ${balance.toFixed(2)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"
            aria-label="Close payment dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">
            {error}
          </div>
        )}

        {statusError && (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">
            {statusError}
          </div>
        )}

        {phase === 'loading' && !statusError && (
          <div className="flex items-center justify-center gap-2 py-8 text-xs font-semibold text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin text-amber-600" /> Checking payments provider…
          </div>
        )}

        {notConfigured ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-amber-900">
              <ShieldAlert className="w-4 h-4 text-amber-700" /> Payments provider not configured
            </div>
            <p className="text-slate-700 font-medium leading-relaxed">
              Card payments are disabled until Stripe credentials are supplied. Set{' '}
              <code className="font-mono text-amber-900 font-bold bg-amber-100 px-1 rounded">STRIPE_SECRET_KEY</code> and{' '}
              <code className="font-mono text-amber-900 font-bold bg-amber-100 px-1 rounded">STRIPE_PUBLISHABLE_KEY</code> in the server
              environment, then restart the backend.
            </p>
          </div>
        ) : phase === 'amount' || (phase === 'processing' && !stripeRef.current) ? (
          <form onSubmit={handleCreateIntent} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="payment-amount" className="text-xs font-bold text-slate-700">
                Amount
              </label>
              <input
                id="payment-amount"
                type="number"
                min="0.01"
                step="0.01"
                max={balance > 0 ? balance.toFixed(2) : undefined}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="field-control text-xs font-mono font-bold text-amber-800"
              />
            </div>
            <button
              type="submit"
              disabled={phase === 'processing' || !amountValid}
              className="btn-primary w-full py-2 justify-center text-xs disabled:opacity-50"
            >
              {phase === 'processing'
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Starting secure payment…</>
                : <><CreditCard className="w-4 h-4" /> Pay by card</>}
            </button>
          </form>
        ) : phase === 'card' || phase === 'processing' ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-700">Card details</span>
              <div ref={cardHostRef} className="field-control flex items-center min-h-10" />
              <p className="text-[11px] text-slate-500 font-medium">
                Card data is handled directly by Stripe and never touches NexusHOS servers.
              </p>
            </div>
            <button
              type="button"
              onClick={handleConfirmPayment}
              disabled={phase === 'processing'}
              className="btn-primary w-full py-2 justify-center text-xs disabled:opacity-50"
            >
              {phase === 'processing'
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing payment…</>
                : <><CreditCard className="w-4 h-4" /> Confirm payment of ${amount}</>}
            </button>
          </div>
        ) : phase === 'done' ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-2 text-xs font-bold text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Payment posted to the guest folio.
          </div>
        ) : null}
      </div>
    </div>
  );
};
