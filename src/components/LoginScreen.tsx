import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  Lock,
  Mail,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import { login, AuthUser } from '../api';
import { BrandMark } from './BrandMark';

interface LoginScreenProps {
  onLogin: (user: AuthUser) => void;
  onBookStay?: () => void;
}

const SEED_CREDENTIALS = [
  { role: 'General Manager', email: 'gm@aura.com', password: 'admin123' },
  { role: 'Front Desk', email: 'frontdesk@aura.com', password: 'front123' },
  { role: 'Housekeeping', email: 'house@aura.com', password: 'house123' },
  { role: 'Finance', email: 'finance@aura.com', password: 'fin123' },
];

const platformHighlights = [
  {
    icon: CalendarCheck2,
    title: 'Live property operations',
    description: 'Reservations, rooms, folios, and service work in one current view.',
  },
  {
    icon: Workflow,
    title: 'Controlled automation',
    description: 'Approval-aware workflows with durable delivery and clear ownership.',
  },
  {
    icon: ShieldCheck,
    title: 'Evidence built in',
    description: 'Role-scoped access, secure sessions, and an immutable activity trail.',
  },
];

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, onBookStay }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const showDemoAccounts = ['localhost', '127.0.0.1'].includes(window.location.hostname);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email || !password) return;
    setError('');
    setSubmitting(true);
    try {
      onLogin(await login(email, password));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(520px,0.95fr)]">
      <section className="relative hidden min-h-screen overflow-hidden border-r border-slate-200 bg-white lg:flex lg:flex-col lg:justify-between lg:p-14 xl:p-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(217,119,6,0.06),transparent_28rem),radial-gradient(circle_at_75%_80%,rgba(37,99,235,0.05),transparent_30rem)]" />
        <div className="relative">
          <div className="flex items-center gap-4">
            <BrandMark className="h-16 w-16 drop-shadow-[0_4px_16px_rgba(217,119,6,0.2)]" />
            <div>
              <div className="text-2xl font-black tracking-[-0.03em] text-slate-900 leading-none">
                Nexus <span className="text-amber-600">HOS</span>
              </div>
              <div className="mt-1.5 text-xs font-bold uppercase tracking-[0.2em] text-slate-500 leading-none">Hotel operating system</div>
            </div>
          </div>

          <div className="mt-24 max-w-2xl">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber-600">Property operations, without the noise</p>
            <h1 className="mt-5 text-5xl font-bold leading-[1.08] tracking-[-0.055em] text-slate-900 xl:text-6xl">
              Every stay, team, and decision in one calm workspace.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-600">
              Run front office, service delivery, finance, and guest operations from a secure system designed for fast, confident work.
            </p>
          </div>

          <div className="mt-14 grid max-w-2xl gap-4">
            {platformHighlights.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-xs">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">{title}</div>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-2 text-xs font-semibold text-slate-500">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          Local property services are operational
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-[480px]">
          <div className="mb-9 flex items-center gap-3.5 lg:hidden">
            <BrandMark className="h-14 w-14" />
            <div>
              <div className="text-xl font-black text-slate-900 leading-none">
                Nexus <span className="text-amber-600">HOS</span>
              </div>
              <div className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-500 leading-none">Hotel operating system</div>
            </div>
          </div>

          <div className="mb-8">
            <BrandMark className="mb-5 h-16 w-16 drop-shadow-[0_4px_16px_rgba(217,119,6,0.2)]" />
            <h2 className="text-3xl font-bold tracking-[-0.04em] text-slate-900">Welcome back</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Sign in to continue to your property workspace.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" aria-label="Staff sign in">
            {error && (
              <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 font-semibold">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            <label htmlFor="login-email" className="block text-xs font-bold text-slate-700">
              Work email
              <span className="relative mt-2 block">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="login-email"
                  type="email"
                  placeholder="name@hotel.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="field-control h-12 !pl-10 text-sm"
                  required
                  autoFocus
                  autoComplete="username"
                />
              </span>
            </label>

            <label htmlFor="login-password" className="block text-xs font-bold text-slate-700">
              Password
              <span className="relative mt-2 block">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="login-password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="field-control h-12 !pl-10 text-sm"
                  required
                  autoComplete="current-password"
                />
              </span>
            </label>

            <button type="submit" disabled={submitting} className="btn-primary h-12 w-full text-sm">
              {submitting ? 'Signing in…' : 'Continue to workspace'}
              {!submitting && <ArrowRight className="h-4 w-4" />}
            </button>

            {onBookStay && (
              <button type="button" onClick={onBookStay} className="btn-secondary h-12 w-full text-sm">
                <CalendarDays className="h-4 w-4 text-amber-600" />
                Open guest booking
              </button>
            )}
          </form>

          {showDemoAccounts && (
            <section className="mt-8 border-t border-slate-200 pt-6" aria-labelledby="demo-accounts-title">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 id="demo-accounts-title" className="text-xs font-bold text-slate-800">Local demo access</h3>
                  <p className="mt-1 text-[11px] text-slate-500">Choose a role to fill the local credentials.</p>
                </div>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9px] font-extrabold uppercase tracking-wider text-emerald-700">Local only</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {SEED_CREDENTIALS.map((credential) => (
                  <button
                    key={credential.email}
                    type="button"
                    onClick={() => {
                      setEmail(credential.email);
                      setPassword(credential.password);
                      setError('');
                    }}
                    className="rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-amber-300 hover:bg-slate-50 shadow-xs"
                  >
                    <span className="block text-xs font-bold text-slate-900">{credential.role}</span>
                    <span className="mt-1 block truncate text-[10px] text-slate-500">{credential.email}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </section>
    </main>
  );
};
