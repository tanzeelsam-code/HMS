import React, { useMemo, useState } from 'react';
import { CheckCircle2, KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { ApiError, AuthUser, changePassword } from '../api';

interface ChangePasswordScreenProps {
  user: AuthUser;
  onChanged: (user: AuthUser) => void;
  onLogout: () => void;
}

export const ChangePasswordScreen: React.FC<ChangePasswordScreenProps> = ({
  user,
  onChanged,
  onLogout,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const checks = useMemo(() => [
    ['12–128 characters', nextPassword.length >= 12 && nextPassword.length <= 128],
    ['Lowercase letter', /[a-z]/.test(nextPassword)],
    ['Uppercase letter', /[A-Z]/.test(nextPassword)],
    ['Number', /\d/.test(nextPassword)],
    ['Symbol', /[^A-Za-z0-9]/.test(nextPassword)],
    ['Passwords match', !!nextPassword && nextPassword === confirmation],
  ] as const, [nextPassword, confirmation]);
  const ready = checks.every(([, passed]) => passed) && !!currentPassword;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      onChanged(await changePassword(currentPassword, nextPassword));
    } catch (caught) {
      setError(caught instanceof ApiError || caught instanceof Error ? caught.message : 'Password change failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-gray-100 flex items-center justify-center p-4">
      <section className="w-full max-w-xl glass-panel p-6 sm:p-8" aria-labelledby="password-change-title">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-amber-500/15 border border-amber-400/30 p-3 text-amber-300">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">Account protection</p>
            <h1 id="password-change-title" className="text-xl font-black mt-1">Create your private password</h1>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">
              Welcome, {user.name}. An administrator issued a temporary password. Change it before entering hotel operations; your other sessions will be revoked.
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="mt-7 space-y-4">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400">
            Temporary password
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-gray-100 outline-none focus:border-amber-400"
            />
          </label>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400">
            New password
            <input
              type="password"
              value={nextPassword}
              onChange={(event) => setNextPassword(event.target.value)}
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-gray-100 outline-none focus:border-amber-400"
            />
          </label>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400">
            Confirm new password
            <input
              type="password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="new-password"
              required
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-gray-100 outline-none focus:border-amber-400"
            />
          </label>

          <div className="grid grid-cols-2 gap-2" aria-label="Password requirements">
            {checks.map(([label, passed]) => (
              <div key={label} className={`flex items-center gap-2 text-[10px] ${passed ? 'text-emerald-300' : 'text-gray-500'}`}>
                <CheckCircle2 className="w-3.5 h-3.5" /> {label}
              </div>
            ))}
          </div>

          {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}

          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
            <button type="button" onClick={onLogout} className="btn-secondary flex-1 justify-center py-2.5 text-xs">
              <LogOut className="w-4 h-4" /> Sign out
            </button>
            <button type="submit" disabled={!ready || submitting} className="btn-primary flex-1 justify-center py-2.5 text-xs disabled:opacity-40">
              <KeyRound className="w-4 h-4" /> {submitting ? 'Securing account…' : 'Change password'}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
};
