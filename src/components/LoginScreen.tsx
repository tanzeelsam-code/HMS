import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  BrainCircuit,
  CalendarCheck2,
  CalendarDays,
  ChartNoAxesCombined,
  CheckCircle2,
  Lock,
  Mail,
  Sparkles,
} from 'lucide-react';
import { login, AuthUser } from '../api';

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
    title: 'Front desk & reservations',
    description: 'Manage bookings, rooms, check-ins, and guest folios.',
  },
  {
    icon: BedDouble,
    title: 'Guest experience',
    description: 'Know every guest, handle requests, and build loyalty.',
  },
  {
    icon: ChartNoAxesCombined,
    title: 'Revenue & finance',
    description: 'Control rates, channels, accounting, and performance.',
  },
  {
    icon: BrainCircuit,
    title: 'AI hotel assistant',
    description: 'Forecast demand, optimize rates, and support your team.',
  },
];

const Logo = ({ className }: { className: string }) => (
  <img src="/assets/nexus-emblem.png" alt="Nexus HOS emblem" className={className} />
);

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
    <main className="min-h-screen bg-slate-50 text-slate-900 lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(500px,0.92fr)]">
      <section className="relative hidden min-h-screen overflow-hidden border-r border-slate-200 bg-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16 2xl:p-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(34,211,238,0.11),transparent_27rem),radial-gradient(circle_at_8%_3%,rgba(217,119,6,0.09),transparent_30rem),radial-gradient(circle_at_88%_88%,rgba(37,99,235,0.05),transparent_30rem)]" />
        <div className="relative flex min-h-[calc(100vh-6rem)] flex-col xl:min-h-[calc(100vh-8rem)] 2xl:min-h-[calc(100vh-10rem)]">
          <header className="flex items-center gap-7 xl:gap-9">
            <div className="relative shrink-0">
              <div className="absolute inset-3 rounded-full bg-cyan-400/15 blur-3xl" />
              <Logo className="relative h-36 w-36 object-contain drop-shadow-[0_20px_42px_rgba(14,116,144,0.22)] xl:h-44 xl:w-44" />
            </div>
            <div>
              <div className="text-4xl font-black leading-none tracking-[-0.045em] text-slate-950 xl:text-5xl">
                Nexus <span className="text-amber-600">HOS</span>
              </div>
              <div className="mt-3 text-xl font-extrabold uppercase leading-tight tracking-[0.11em] text-slate-600 xl:text-2xl">
                Hotel Operating System
              </div>
            </div>
          </header>

          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3 xl:mt-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3.5 py-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-cyan-800">
              <Sparkles className="h-3.5 w-3.5" />
              AI-powered hotel operations
            </div>
            <p className="text-sm font-semibold text-slate-600">
              One intelligent platform for every stay, every team, and every decision.
            </p>
          </div>

          <div className="mt-9 max-w-3xl xl:mt-11">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber-600">Built for modern hotels</p>
            <h1 className="mt-4 text-4xl font-black leading-[1.06] tracking-[-0.055em] text-slate-950 xl:text-5xl">
              Run your entire hotel from one intelligent platform.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 xl:text-base xl:leading-7">
              Connect your front desk, guest services, housekeeping, revenue, and finance in one complete hotel management system.
            </p>
          </div>

          <div className="mt-8 grid max-w-3xl grid-cols-2 gap-3 xl:mt-9">
            {platformHighlights.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex items-start gap-3.5 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                  <Icon className="h-[18px] w-[18px]" />
                </div>
                <div>
                  <div className="text-sm font-extrabold text-slate-900">{title}</div>
                  <p className="mt-1 text-[11px] leading-[1.45] text-slate-600">{description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-auto flex items-center gap-2 pt-8 text-xs font-semibold text-slate-500">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Secure, connected, and ready for your team
          </div>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-[480px]">
          <div className="mb-7 flex items-center gap-5 lg:hidden">
            <Logo className="h-24 w-24 shrink-0 object-contain drop-shadow-[0_10px_24px_rgba(14,116,144,0.2)]" />
            <div>
              <div className="text-3xl font-black leading-none tracking-[-0.04em] text-slate-950">
                Nexus <span className="text-amber-600">HOS</span>
              </div>
              <div className="mt-2 text-sm font-extrabold uppercase leading-tight tracking-[0.1em] text-slate-600">
                Hotel Operating System
              </div>
            </div>
          </div>

          <div className="mb-7 lg:hidden">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.14em] text-cyan-800">
              <Sparkles className="h-3 w-3" />
              AI-powered hotel operations
            </div>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
              One intelligent platform for every stay, every team, and every decision.
            </p>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-bold tracking-[-0.04em] text-slate-900">Welcome back</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Sign in to continue to your property workspace.</p>
          </div>

          <section className="mb-7 grid grid-cols-2 gap-2 lg:hidden" aria-label="Nexus HOS features">
            {platformHighlights.map(({ icon: Icon, title }) => (
              <div key={title} className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-xs">
                <Icon className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                <span className="text-[10px] font-bold leading-tight text-slate-700">{title}</span>
              </div>
            ))}
          </section>

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
