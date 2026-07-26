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
    title: 'Stay operations',
    description: 'Bookings, rooms, folios, and housekeeping.',
  },
  {
    icon: BedDouble,
    title: 'Guest experience',
    description: 'Profiles, requests, groups, and reputation.',
  },
  {
    icon: ChartNoAxesCombined,
    title: 'Business control',
    description: 'Revenue, finance, channels, and analytics.',
  },
  {
    icon: BrainCircuit,
    title: 'AI intelligence',
    description: 'Smart pricing, forecasts, and a staff copilot.',
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
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_27%_24%,rgba(34,211,238,0.08),transparent_25rem),radial-gradient(circle_at_12%_8%,rgba(217,119,6,0.08),transparent_30rem),radial-gradient(circle_at_80%_85%,rgba(37,99,235,0.05),transparent_30rem)]" />
        <div className="relative">
          <div className="flex items-center gap-4">
            <Logo className="h-16 w-16 object-contain drop-shadow-[0_6px_18px_rgba(14,116,144,0.2)]" />
            <div>
              <div className="text-2xl font-black tracking-[-0.03em] text-slate-900 leading-none">
                Nexus <span className="text-amber-600">HOS</span>
              </div>
              <div className="mt-1.5 text-xs font-bold uppercase tracking-[0.2em] text-slate-500 leading-none">Hotel operating system</div>
            </div>
          </div>

          <div className="mt-12 flex max-w-3xl items-center gap-8 xl:mt-16 xl:gap-10">
            <div className="relative shrink-0">
              <div className="absolute inset-3 rounded-full bg-cyan-400/10 blur-3xl" />
              <Logo className="relative h-40 w-40 object-contain drop-shadow-[0_22px_44px_rgba(14,116,144,0.2)] xl:h-48 xl:w-48" />
            </div>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-cyan-800">
                <Sparkles className="h-3 w-3" />
                AI-powered hotel operations
              </div>
              <p className="mt-4 max-w-sm text-sm leading-6 text-slate-600">
                One intelligent system for every stay, team, and decision.
              </p>
            </div>
          </div>

          <div className="mt-10 max-w-3xl xl:mt-12">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber-600">Property operations, without the noise</p>
            <h1 className="mt-5 text-4xl font-bold leading-[1.08] tracking-[-0.055em] text-slate-900 xl:text-5xl 2xl:text-6xl">
              Every stay, team, and decision in one calm workspace.
            </h1>
          </div>

          <div className="mt-10 grid max-w-3xl grid-cols-2 gap-3">
            {platformHighlights.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/85 p-3.5 shadow-xs">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">{title}</div>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-600">{description}</p>
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
          <div className="mb-8 flex items-center gap-3.5 lg:hidden">
            <Logo className="h-16 w-16 object-contain drop-shadow-[0_6px_18px_rgba(14,116,144,0.18)]" />
            <div>
              <div className="text-xl font-black text-slate-900 leading-none">
                Nexus <span className="text-amber-600">HOS</span>
              </div>
              <div className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-500 leading-none">Hotel operating system</div>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-bold tracking-[-0.04em] text-slate-900">Welcome back</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Sign in to continue to your property workspace.</p>
          </div>

          <section className="mb-7 grid grid-cols-2 gap-2 lg:hidden" aria-label="Nexus HOS features">
            {platformHighlights.map(({ icon: Icon, title }) => (
              <div key={title} className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-xs">
                <Icon className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                <span className="text-[11px] font-bold text-slate-700">{title}</span>
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
