import React, { useState } from 'react';
import { Lock, Mail, LogIn, ShieldCheck, AlertTriangle } from 'lucide-react';
import { login, AuthUser } from '../api';

interface LoginScreenProps {
  onLogin: (user: AuthUser) => void;
}

const SEED_CREDENTIALS = [
  { role: 'General Manager', email: 'gm@aura.com', password: 'admin123' },
  { role: 'Front Desk', email: 'frontdesk@aura.com', password: 'front123' },
  { role: 'Housekeeping', email: 'house@aura.com', password: 'house123' },
  { role: 'Finance', email: 'finance@aura.com', password: 'fin123' },
];

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setError('');
    setSubmitting(true);
    try {
      const user = await login(email, password);
      onLogin(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-gray-100 p-4">
      <div className="w-full max-w-md space-y-5 animate-slide-up">
        {/* Brand */}
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-200 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-black text-2xl tracking-tighter animate-pulse-glow">
            A
          </div>
          <div>
            <div className="flex items-center justify-center gap-2">
              <span className="font-extrabold text-2xl tracking-tight text-gold-gradient">AuraHMS</span>
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/20">
                Enterprise AI
              </span>
            </div>
            <p className="text-xs text-gray-400 font-medium mt-1">Property Management Suite — Staff Sign In</p>
          </div>
        </div>

        {/* Login Card */}
        <form onSubmit={handleSubmit} className="glass-panel p-6 space-y-4 border border-white/10 shadow-2xl">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-gray-400 font-semibold mb-1.5 text-xs">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                placeholder="you@aura.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-slate-900 border border-white/10 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-400/50 transition-all"
                required
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-gray-400 font-semibold mb-1.5 text-xs">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-slate-900 border border-white/10 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-400/50 transition-all"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full justify-center py-2.5 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <LogIn className="w-4 h-4" />
            {submitting ? 'Signing in…' : 'Sign In to Property'}
          </button>
        </form>

        {/* Seed Credentials Hint */}
        <div className="glass-panel p-4 border border-white/5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" /> Demo Accounts
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
            {SEED_CREDENTIALS.map((c) => (
              <button
                key={c.email}
                type="button"
                onClick={() => { setEmail(c.email); setPassword(c.password); setError(''); }}
                className="text-left px-2 py-1.5 rounded-md hover:bg-white/5 transition-all group"
                title="Click to autofill"
              >
                <span className="block text-gray-300 font-semibold group-hover:text-amber-300">{c.role}</span>
                <span className="block text-gray-500 font-mono">{c.email} / {c.password}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
