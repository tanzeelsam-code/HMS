import React, { useMemo, useState } from 'react';
import { CheckCircle2, KeyRound, ShieldCheck, X } from 'lucide-react';
import { ApiError, AuthUser, changePassword } from '../api';
import { VisiblePasswordInput } from './VisiblePasswordInput';

interface ChangeOwnPasswordModalProps {
  user: AuthUser;
  onClose: () => void;
  onChanged: (user: AuthUser) => void;
}

export const ChangeOwnPasswordModal: React.FC<ChangeOwnPasswordModalProps> = ({
  user,
  onClose,
  onChanged,
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
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError || caught instanceof Error ? caught.message : 'Password change failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-2xl" aria-labelledby="self-password-change-title">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-amber-50 border border-amber-300 p-3 text-amber-800">
              <ShieldCheck className="w-6 h-6 text-amber-700" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Account protection</p>
              <h2 id="self-password-change-title" className="text-xl font-extrabold text-slate-900 mt-1">Change your password</h2>
              <p className="text-xs font-semibold text-slate-600 mt-2 leading-relaxed">
                Signed in as {user.name}. Enter your current password, then choose a new private password for this account.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close password dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="mt-7 space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700" htmlFor="current-password">
              Current password
            </label>
            <VisiblePasswordInput
              id="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              required
              wrapperClassName="relative mt-1.5"
              className="field-control text-xs font-bold pr-10"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700" htmlFor="own-new-password">
              New password
            </label>
            <VisiblePasswordInput
              id="own-new-password"
              value={nextPassword}
              onChange={(event) => setNextPassword(event.target.value)}
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              wrapperClassName="relative mt-1.5"
              className="field-control text-xs font-bold pr-10"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700" htmlFor="own-confirm-password">
              Confirm new password
            </label>
            <VisiblePasswordInput
              id="own-confirm-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="new-password"
              required
              wrapperClassName="relative mt-1.5"
              className="field-control text-xs font-bold pr-10"
            />
          </div>

          <div className="grid grid-cols-2 gap-2" aria-label="Password requirements">
            {checks.map(([label, passed]) => (
              <div key={label} className={`flex items-center gap-2 text-[10px] font-bold ${passed ? 'text-emerald-800' : 'text-slate-400'}`}>
                <CheckCircle2 className="w-3.5 h-3.5" /> {label}
              </div>
            ))}
          </div>

          {error && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-900">{error}</p>}

          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2.5 text-xs font-bold">
              Cancel
            </button>
            <button type="submit" disabled={!ready || submitting} className="btn-primary flex-1 justify-center py-2.5 text-xs font-bold disabled:opacity-40">
              <KeyRound className="w-4 h-4" /> {submitting ? 'Securing account…' : 'Change password'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
