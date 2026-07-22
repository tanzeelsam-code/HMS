import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clipboard,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  LogOut,
  Mail,
  Power,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  ShieldX,
  Sparkles,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api, ApiError, AuthUser } from '../api';

type UserRole = 'General Manager' | 'Front Desk' | 'Housekeeping' | 'Finance';

interface PropertyMembership {
  propertyId: string;
  propertyCode: string;
  propertyName: string;
  propertyStatus: string;
  role: UserRole;
  createdAt: string;
}

interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  mustChangePassword: boolean;
  activeSessionCount: number;
  memberships: PropertyMembership[];
  version: string;
}

interface ManagedProperty {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  timezone: string;
  currency: string;
  locale: string;
  totalRooms: number;
  status: string;
}

interface UserMutationResult {
  user: ManagedUser;
  revokedSessions: number;
}

interface NewUserDraft {
  name: string;
  email: string;
  role: UserRole;
  password: string;
  propertyIds: string[];
}

interface AccessAdministrationProps {
  user: AuthUser;
}

const ROLES: UserRole[] = ['General Manager', 'Front Desk', 'Housekeeping', 'Finance'];

const emptyNewUser = (): NewUserDraft => ({
  name: '',
  email: '',
  role: 'Front Desk',
  password: '',
  propertyIds: [],
});

const roleStyle: Record<UserRole, string> = {
  'General Manager': 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  Finance: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  'Front Desk': 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  Housekeeping: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
};

const passwordChecks = (password: string) => [
  { label: '12–128 characters', met: password.length >= 12 && password.length <= 128 },
  { label: 'Lowercase letter', met: /[a-z]/.test(password) },
  { label: 'Uppercase letter', met: /[A-Z]/.test(password) },
  { label: 'Number', met: /\d/.test(password) },
  { label: 'Symbol', met: /[^A-Za-z0-9]/.test(password) },
];

const secureRandomIndex = (length: number) => {
  if (length < 1) return 0;
  const range = 0x1_0000_0000;
  const cutoff = range - (range % length);
  const values = new Uint32Array(1);
  do window.crypto.getRandomValues(values); while (values[0] >= cutoff);
  return values[0] % length;
};

const generateStrongPassword = () => {
  const groups = [
    'abcdefghijkmnopqrstuvwxyz',
    'ABCDEFGHJKLMNPQRSTUVWXYZ',
    '23456789',
    '!@#$%^&*_-+=',
  ];
  const all = groups.join('');
  const characters = groups.map((group) => group[secureRandomIndex(group.length)]);
  while (characters.length < 18) characters.push(all[secureRandomIndex(all.length)]);
  for (let index = characters.length - 1; index > 0; index--) {
    const target = secureRandomIndex(index + 1);
    [characters[index], characters[target]] = [characters[target], characters[index]];
  }
  return characters.join('');
};

const toggleValue = (values: string[], value: string) => values.includes(value)
  ? values.filter((candidate) => candidate !== value)
  : [...values, value];

export const AccessAdministration: React.FC<AccessAdministrationProps> = ({ user }) => {
  const isGeneralManager = user.role === 'General Manager';
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [properties, setProperties] = useState<ManagedProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState<NewUserDraft>(emptyNewUser);
  const [newPasswordVisible, setNewPasswordVisible] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('Front Desk');
  const [membershipIds, setMembershipIds] = useState<string[]>([]);
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordVisible, setResetPasswordVisible] = useState(false);

  const selectedUser = users.find((candidate) => candidate.id === selectedId) || null;
  const activeProperties = properties.filter((property) => property.status === 'Active');
  const isSelf = selectedUser?.email.toLowerCase() === user.email.toLowerCase();

  const loadDirectory = useCallback(async () => {
    if (!isGeneralManager) return;
    const [loadedUsers, loadedProperties] = await Promise.all([
      api.get<ManagedUser[]>('/admin/users'),
      api.get<ManagedProperty[]>('/admin/properties'),
    ]);
    setUsers(loadedUsers);
    setProperties(loadedProperties);
    setSelectedId((current) => current && loadedUsers.some((candidate) => candidate.id === current)
      ? current
      : loadedUsers[0]?.id || null);
  }, [isGeneralManager]);

  useEffect(() => {
    if (!isGeneralManager) {
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    void loadDirectory()
      .catch((caught) => {
        if (mounted) setError(caught instanceof Error ? caught.message : 'Unable to load access directory');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [isGeneralManager, loadDirectory]);

  useEffect(() => {
    if (!selectedUser) return;
    setEditName(selectedUser.name);
    setEditEmail(selectedUser.email);
    setEditRole(selectedUser.role);
    setMembershipIds(selectedUser.memberships.map((membership) => membership.propertyId));
    setResetPassword('');
    setResetPasswordVisible(false);
  }, [selectedUser?.id, selectedUser?.version]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const filteredUsers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((candidate) => [
      candidate.name,
      candidate.email,
      candidate.role,
      ...candidate.memberships.flatMap((membership) => [membership.propertyName, membership.propertyCode]),
    ].some((value) => value.toLowerCase().includes(needle)));
  }, [search, users]);

  const activeUserCount = users.filter((candidate) => candidate.active).length;
  const activeGmCount = users.filter((candidate) => candidate.active && candidate.role === 'General Manager').length;
  const forcedChangeCount = users.filter((candidate) => candidate.active && candidate.mustChangePassword).length;

  const replaceUser = (updated: ManagedUser) => {
    setUsers((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
  };

  const handleMutationError = async (caught: unknown, fallback: string) => {
    setError(caught instanceof Error ? caught.message : fallback);
    if (caught instanceof ApiError && caught.status === 409) {
      try { await loadDirectory(); } catch { /* Preserve the original conflict message. */ }
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    setError('');
    try {
      await loadDirectory();
      setNotice('Access directory refreshed.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to refresh access directory');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusyAction('create');
    setError('');
    try {
      const created = await api.post<ManagedUser>('/admin/users', {
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        password: newUser.password,
        propertyIds: newUser.propertyIds,
      });
      setUsers((current) => [...current, created].sort((left, right) => left.name.localeCompare(right.name)));
      setSelectedId(created.id);
      setNewUser(emptyNewUser());
      setNewPasswordVisible(false);
      setShowCreate(false);
      setNotice('User created. Their temporary password must be changed at first sign-in.');
    } catch (caught) {
      await handleMutationError(caught, 'Unable to create user');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedUser) return;
    setBusyAction('profile');
    setError('');
    try {
      const updated = await api.patch<ManagedUser>(`/admin/users/${encodeURIComponent(selectedUser.id)}`, {
        ifVersion: selectedUser.version,
        name: editName,
        email: editEmail,
        role: editRole,
      });
      replaceUser(updated);
      setNotice('Account details updated. Role or email changes revoke existing sessions.');
    } catch (caught) {
      await handleMutationError(caught, 'Unable to update account');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveMemberships = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedUser) return;
    setBusyAction('memberships');
    setError('');
    try {
      const updated = await api.patch<ManagedUser>(
        `/admin/users/${encodeURIComponent(selectedUser.id)}/memberships`,
        { ifVersion: selectedUser.version, propertyIds: membershipIds },
      );
      replaceUser(updated);
      setNotice('Property access assignments updated.');
    } catch (caught) {
      await handleMutationError(caught, 'Unable to update property access');
    } finally {
      setBusyAction(null);
    }
  };

  const handleStatusChange = async () => {
    if (!selectedUser) return;
    const operation = selectedUser.active ? 'disable' : 'reactivate';
    if (selectedUser.active && !window.confirm(
      `Disable ${selectedUser.name}? All of their active sessions will be revoked immediately.`,
    )) return;
    setBusyAction('status');
    setError('');
    try {
      const result = await api.post<UserMutationResult>(
        `/admin/users/${encodeURIComponent(selectedUser.id)}/${operation}`,
        { ifVersion: selectedUser.version },
      );
      replaceUser(result.user);
      setNotice(selectedUser.active
        ? `Account disabled and ${result.revokedSessions} session(s) revoked.`
        : 'Account reactivated.');
    } catch (caught) {
      await handleMutationError(caught, `Unable to ${operation} account`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedUser) return;
    if (!window.confirm(`Reset the password for ${selectedUser.name} and revoke all of their sessions?`)) return;
    setBusyAction('password');
    setError('');
    try {
      const result = await api.post<UserMutationResult>(
        `/admin/users/${encodeURIComponent(selectedUser.id)}/reset-password`,
        { ifVersion: selectedUser.version, newPassword: resetPassword },
      );
      replaceUser(result.user);
      setResetPassword('');
      setResetPasswordVisible(false);
      setNotice(`Temporary password set and ${result.revokedSessions} session(s) revoked.`);
    } catch (caught) {
      await handleMutationError(caught, 'Unable to reset password');
    } finally {
      setBusyAction(null);
    }
  };

  const handleRevokeSessions = async () => {
    if (!selectedUser) return;
    if (!window.confirm(`Revoke every active session for ${selectedUser.name}?`)) return;
    setBusyAction('sessions');
    setError('');
    try {
      const result = await api.post<UserMutationResult>(
        `/admin/users/${encodeURIComponent(selectedUser.id)}/revoke-sessions`,
        { ifVersion: selectedUser.version },
      );
      replaceUser(result.user);
      setNotice(`${result.revokedSessions} session(s) revoked.`);
    } catch (caught) {
      await handleMutationError(caught, 'Unable to revoke sessions');
    } finally {
      setBusyAction(null);
    }
  };

  const copyPassword = async (password: string) => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setNotice('Temporary password copied. Transfer it through an approved secure channel.');
    } catch {
      setError('Clipboard access was blocked. Reveal and copy the password manually.');
    }
  };

  if (!isGeneralManager) {
    return (
      <div className="glass-panel p-8 text-center space-y-3 animate-slide-up" role="alert">
        <ShieldX className="w-10 h-10 text-rose-400 mx-auto" />
        <h2 className="text-lg font-bold text-gray-100">General Manager access required</h2>
        <p className="text-sm text-gray-400 max-w-xl mx-auto">
          Account lifecycle, session revocation, and property access are restricted to General Managers.
        </p>
      </div>
    );
  }

  if (loading && users.length === 0) {
    return (
      <div className="glass-panel p-10 flex items-center justify-center text-sm text-gray-400 animate-slide-up" role="status">
        <RefreshCw className="w-4 h-4 mr-2 animate-spin text-amber-400" /> Loading account directory…
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <header className="glass-panel p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-gray-100 tracking-tight">Account & Access Administration</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
              General Manager only
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1 max-w-3xl">
            Create staff accounts, enforce credential rotation, revoke sessions, and scope access to managed properties.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void handleRefresh()} disabled={loading} className="btn-secondary text-xs px-3 py-2 disabled:opacity-60">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button type="button" onClick={() => setShowCreate((shown) => !shown)} className="btn-primary text-xs px-3 py-2" aria-expanded={showCreate} aria-controls="create-user-panel">
            <UserPlus className="w-3.5 h-3.5" /> New user
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> <span>{error}</span>
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> <span>{notice}</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Active users" value={activeUserCount} icon={<Users className="w-4 h-4 text-blue-400" />} />
        <MetricCard label="Active GMs" value={activeGmCount} icon={<ShieldCheck className="w-4 h-4 text-amber-400" />} />
        <MetricCard label="Password change due" value={forcedChangeCount} icon={<KeyRound className="w-4 h-4 text-rose-400" />} />
        <MetricCard label="Managed properties" value={activeProperties.length} icon={<Building2 className="w-4 h-4 text-emerald-400" />} />
      </div>

      {showCreate && (
        <form id="create-user-panel" onSubmit={(event) => void handleCreateUser(event)} className="glass-panel-gold rounded-xl p-5 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-amber-200 flex items-center gap-2"><UserPlus className="w-4 h-4" /> Create staff account</h3>
              <p className="text-[11px] text-gray-400 mt-1">The user must replace this temporary password after first sign-in.</p>
            </div>
            <button type="button" onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10" aria-label="Close create user form">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <TextField id="new-user-name" label="Full name" value={newUser.name} onChange={(value) => setNewUser({ ...newUser, name: value })} autoComplete="name" required />
            <TextField id="new-user-email" label="Sign-in email" type="email" value={newUser.email} onChange={(value) => setNewUser({ ...newUser, email: value })} autoComplete="email" required />
            <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400" htmlFor="new-user-role">
              Global role
              <select id="new-user-role" value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value as UserRole })} className="block mt-1.5 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-xs text-gray-200 normal-case tracking-normal outline-none focus:border-amber-400">
                {ROLES.map((role) => <option key={role}>{role}</option>)}
              </select>
            </label>
          </div>

          <PasswordEditor
            id="new-user-password"
            value={newUser.password}
            visible={newPasswordVisible}
            onVisibleChange={setNewPasswordVisible}
            onChange={(value) => setNewUser({ ...newUser, password: value })}
            onGenerate={() => { setNewUser({ ...newUser, password: generateStrongPassword() }); setNewPasswordVisible(true); }}
            onCopy={() => void copyPassword(newUser.password)}
          />

          <PropertySelector
            legend="Initial property access"
            properties={activeProperties}
            selectedIds={newUser.propertyIds}
            onToggle={(propertyId) => setNewUser({ ...newUser, propertyIds: toggleValue(newUser.propertyIds, propertyId) })}
          />

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary text-xs px-4 py-2">Cancel</button>
            <button type="submit" disabled={busyAction !== null || !passwordChecks(newUser.password).every((check) => check.met) || newUser.propertyIds.length === 0} className="btn-primary text-xs px-4 py-2 disabled:opacity-50">
              <UserPlus className="w-3.5 h-3.5" /> {busyAction === 'create' ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <aside className="xl:col-span-4 glass-panel p-4 space-y-4 xl:sticky xl:top-24">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-gray-100">Staff directory</h3>
            <span className="text-[11px] text-gray-500">{filteredUsers.length} user(s)</span>
          </div>
          <label className="relative block" htmlFor="access-user-search">
            <span className="sr-only">Search staff accounts</span>
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-500" />
            <input id="access-user-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, role, property…" className="w-full rounded-lg border border-white/10 bg-slate-950 pl-9 pr-3 py-2 text-xs text-gray-200 outline-none focus:border-amber-400" />
          </label>
          <div className="space-y-2 max-h-[680px] overflow-y-auto pr-1">
            {filteredUsers.map((managedUser) => (
              <button
                key={managedUser.id}
                type="button"
                onClick={() => { setSelectedId(managedUser.id); setError(''); }}
                className={`w-full rounded-xl border p-3.5 text-left transition-colors ${
                  selectedId === managedUser.id
                    ? 'border-amber-500/40 bg-amber-500/10'
                    : 'border-white/10 bg-slate-950/60 hover:border-white/20 hover:bg-white/[0.03]'
                } ${managedUser.active ? '' : 'opacity-65'}`}
                aria-pressed={selectedId === managedUser.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${managedUser.active ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                      <span className="text-xs font-bold text-gray-100 truncate">{managedUser.name}</span>
                      {managedUser.email.toLowerCase() === user.email.toLowerCase() && <span className="text-[9px] font-bold text-amber-300">YOU</span>}
                    </div>
                    <div className="text-[10px] text-gray-500 truncate mt-1">{managedUser.email}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full border text-[9px] font-bold flex-shrink-0 ${roleStyle[managedUser.role]}`}>{managedUser.role}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-[10px] text-gray-500">
                  <span>{managedUser.memberships.length} propert{managedUser.memberships.length === 1 ? 'y' : 'ies'}</span>
                  <span>{managedUser.activeSessionCount} session(s)</span>
                  {managedUser.mustChangePassword && <span className="text-rose-300">Password change due</span>}
                </div>
              </button>
            ))}
            {filteredUsers.length === 0 && <div className="py-8 text-center text-xs text-gray-500">No staff accounts match this search.</div>}
          </div>
        </aside>

        <main className="xl:col-span-8 space-y-5">
          {!selectedUser ? (
            <div className="glass-panel p-10 text-center text-sm text-gray-500">Select a staff account to manage access.</div>
          ) : (
            <>
              <section className="glass-panel p-5 space-y-4" aria-labelledby="selected-account-title">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 id="selected-account-title" className="text-lg font-bold text-gray-100">{selectedUser.name}</h3>
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${roleStyle[selectedUser.role]}`}>{selectedUser.role}</span>
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${selectedUser.active ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/10 text-rose-300 border-rose-500/30'}`}>{selectedUser.active ? 'Active' : 'Disabled'}</span>
                      {selectedUser.mustChangePassword && <span className="px-2 py-0.5 rounded-full border text-[10px] font-bold bg-rose-500/10 text-rose-300 border-rose-500/30">Password change required</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {selectedUser.email}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void handleRevokeSessions()} disabled={isSelf || selectedUser.activeSessionCount === 0 || busyAction !== null} title={isSelf ? 'Use Sign Out for your own current session' : undefined} className="btn-secondary text-[11px] px-3 py-2 disabled:opacity-45">
                      <LogOut className="w-3.5 h-3.5" /> Revoke sessions
                    </button>
                    <button type="button" onClick={() => void handleStatusChange()} disabled={isSelf || busyAction !== null} title={isSelf ? 'You cannot disable your own account' : undefined} className={`text-[11px] px-3 py-2 rounded-lg border font-bold flex items-center gap-1.5 disabled:opacity-45 ${selectedUser.active ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
                      <Power className="w-3.5 h-3.5" /> {busyAction === 'status' ? 'Updating…' : selectedUser.active ? 'Disable account' : 'Reactivate'}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-white/10 pt-4 text-center">
                  <SummaryValue label="Sessions" value={selectedUser.activeSessionCount} />
                  <SummaryValue label="Properties" value={selectedUser.memberships.length} />
                  <SummaryValue label="Status" value={selectedUser.active ? 'Enabled' : 'Disabled'} />
                  <SummaryValue label="Credential" value={selectedUser.mustChangePassword ? 'Rotate' : 'Current'} />
                </div>
              </section>

              <form onSubmit={(event) => void handleSaveProfile(event)} className="glass-panel p-5 space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-gray-100 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-amber-400" /> Account identity & role</h4>
                  <p className="text-[11px] text-gray-500 mt-1">Role and sign-in email changes invalidate existing sessions. Your own role and email require the personal account flow.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TextField id="edit-user-name" label="Full name" value={editName} onChange={setEditName} required />
                  <TextField id="edit-user-email" label="Sign-in email" type="email" value={editEmail} onChange={setEditEmail} disabled={isSelf} required />
                  <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400 md:col-span-2" htmlFor="edit-user-role">
                    Global role
                    <select id="edit-user-role" value={editRole} disabled={isSelf} onChange={(event) => setEditRole(event.target.value as UserRole)} className="block mt-1.5 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-xs text-gray-200 normal-case tracking-normal outline-none focus:border-amber-400 disabled:opacity-50">
                      {ROLES.map((role) => <option key={role}>{role}</option>)}
                    </select>
                  </label>
                </div>
                <div className="flex justify-end">
                  <button type="submit" disabled={busyAction !== null} className="btn-primary text-xs px-4 py-2 disabled:opacity-50"><Save className="w-3.5 h-3.5" /> {busyAction === 'profile' ? 'Saving…' : 'Save account'}</button>
                </div>
              </form>

              <form onSubmit={(event) => void handleSaveMemberships(event)} className="glass-panel p-5 space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-gray-100 flex items-center gap-2"><Building2 className="w-4 h-4 text-emerald-400" /> Property memberships</h4>
                  <p className="text-[11px] text-gray-500 mt-1">At least one active property is required. Membership roles follow the account&apos;s global role.</p>
                </div>
                <PropertySelector legend="Assigned properties" properties={activeProperties} selectedIds={membershipIds} onToggle={(propertyId) => setMembershipIds(toggleValue(membershipIds, propertyId))} />
                <div className="flex justify-end">
                  <button type="submit" disabled={busyAction !== null || membershipIds.length === 0} className="btn-primary text-xs px-4 py-2 disabled:opacity-50"><Save className="w-3.5 h-3.5" /> {busyAction === 'memberships' ? 'Saving…' : 'Save property access'}</button>
                </div>
              </form>

              <form onSubmit={(event) => void handleResetPassword(event)} className="glass-panel p-5 space-y-4 border border-rose-500/20">
                <div>
                  <h4 className="text-sm font-bold text-gray-100 flex items-center gap-2"><LockKeyhole className="w-4 h-4 text-rose-400" /> Administrative password reset</h4>
                  <p className="text-[11px] text-gray-500 mt-1">This revokes all sessions and forces a password change at the next sign-in. Use the personal password flow for your own account.</p>
                </div>
                <PasswordEditor
                  id="reset-user-password"
                  value={resetPassword}
                  visible={resetPasswordVisible}
                  onVisibleChange={setResetPasswordVisible}
                  onChange={setResetPassword}
                  onGenerate={() => { setResetPassword(generateStrongPassword()); setResetPasswordVisible(true); }}
                  onCopy={() => void copyPassword(resetPassword)}
                  disabled={isSelf}
                />
                <div className="flex justify-end">
                  <button type="submit" disabled={isSelf || busyAction !== null || !passwordChecks(resetPassword).every((check) => check.met)} className="text-xs px-4 py-2 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-200 font-bold flex items-center gap-1.5 disabled:opacity-45">
                    <KeyRound className="w-3.5 h-3.5" /> {busyAction === 'password' ? 'Resetting…' : 'Reset password'}
                  </button>
                </div>
              </form>
            </>
          )}
        </main>
      </div>
    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: number; icon: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="glass-panel p-4">
    <div className="flex items-center justify-between gap-2"><span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">{label}</span>{icon}</div>
    <div className="text-xl font-extrabold text-gray-100 mt-1">{value}</div>
  </div>
);

const SummaryValue: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div><div className="text-sm font-bold text-gray-200">{value}</div><div className="text-[9px] uppercase tracking-wider text-gray-500 mt-0.5">{label}</div></div>
);

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email';
  autoComplete?: string;
  required?: boolean;
  disabled?: boolean;
}

const TextField: React.FC<TextFieldProps> = ({ id, label, value, onChange, type = 'text', autoComplete, required, disabled }) => (
  <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400" htmlFor={id}>
    {label}
    <input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} required={required} disabled={disabled} className="block mt-1.5 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-xs text-gray-200 normal-case tracking-normal outline-none focus:border-amber-400 disabled:opacity-50" />
  </label>
);

interface PasswordEditorProps {
  id: string;
  value: string;
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
  onChange: (value: string) => void;
  onGenerate: () => void;
  onCopy: () => void;
  disabled?: boolean;
}

const PasswordEditor: React.FC<PasswordEditorProps> = ({ id, value, visible, onVisibleChange, onChange, onGenerate, onCopy, disabled }) => {
  const checks = passwordChecks(value);
  return (
    <div className="space-y-2">
      <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400" htmlFor={id}>Temporary password</label>
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <input id={id} type={visible ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} autoComplete="new-password" disabled={disabled} minLength={12} maxLength={128} required className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 pr-10 text-xs font-mono text-gray-200 outline-none focus:border-amber-400 disabled:opacity-50" />
          <button type="button" onClick={() => onVisibleChange(!visible)} disabled={disabled} className="absolute right-2 top-2 p-1 rounded text-gray-500 hover:text-gray-200 disabled:opacity-40" aria-label={visible ? 'Hide password' : 'Show password'}>
            {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
        <button type="button" onClick={onGenerate} disabled={disabled} className="btn-secondary text-xs px-3 py-2 disabled:opacity-50"><Sparkles className="w-3.5 h-3.5" /> Generate</button>
        <button type="button" onClick={onCopy} disabled={disabled || !value} className="btn-secondary text-xs px-3 py-2 disabled:opacity-50"><Clipboard className="w-3.5 h-3.5" /> Copy</button>
      </div>
      <div className="flex flex-wrap gap-1.5" aria-label="Password requirements">
        {checks.map((check) => (
          <span key={check.label} className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${check.met ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-white/10 bg-white/[0.03] text-gray-500'}`}>
            {check.met ? '✓ ' : ''}{check.label}
          </span>
        ))}
      </div>
      <p className="text-[10px] text-gray-500">Avoid names, email identifiers, hotel terms, and previously shared passwords.</p>
    </div>
  );
};

interface PropertySelectorProps {
  legend: string;
  properties: ManagedProperty[];
  selectedIds: string[];
  onToggle: (propertyId: string) => void;
}

const PropertySelector: React.FC<PropertySelectorProps> = ({ legend, properties, selectedIds, onToggle }) => (
  <fieldset className="space-y-2">
    <legend className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{legend}</legend>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
      {properties.map((property) => {
        const selected = selectedIds.includes(property.id);
        return (
          <label key={property.id} className={`rounded-xl border p-3 cursor-pointer transition-colors ${selected ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-white/10 bg-slate-950/60 hover:border-white/20'}`}>
            <div className="flex items-start gap-3">
              <input type="checkbox" checked={selected} onChange={() => onToggle(property.id)} className="mt-0.5 accent-emerald-500" />
              <div className="min-w-0">
                <div className="text-xs font-bold text-gray-200 truncate">{property.name}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">{property.code} • {property.timezone}</div>
                <div className="text-[10px] text-gray-600 mt-1">{property.totalRooms} rooms • {property.currency}</div>
              </div>
            </div>
          </label>
        );
      })}
    </div>
    {properties.length === 0 && <p className="text-xs text-rose-300">No active properties are available for assignment.</p>}
  </fieldset>
);
