import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { GLAccount, JournalEntry, AnomalyAlert, NightAuditSummary, HotelMetrics } from '../types';
import {
  Landmark, Wallet, BookOpen, Plus, Trash2, ShieldAlert, Sparkles,
  MoonStar, CheckCircle2, RefreshCw, AlertTriangle
} from 'lucide-react';

interface AccountingDashboardProps {
  metrics: HotelMetrics | null;
}

interface DraftLine {
  accountId: string;
  debit: string;
  credit: string;
}

const emptyLine = (): DraftLine => ({ accountId: '', debit: '', credit: '' });

const severityStyle = (sev: AnomalyAlert['severity']) =>
  sev === 'High'
    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
    : sev === 'Medium'
      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
      : 'bg-blue-500/20 text-blue-300 border-blue-500/40';

const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const AccountingDashboard: React.FC<AccountingDashboardProps> = ({ metrics }) => {
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // New journal entry form
  const [jeDate, setJeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [jeDescription, setJeDescription] = useState('');
  const [jeLines, setJeLines] = useState<DraftLine[]>([emptyLine(), emptyLine()]);
  const [jeError, setJeError] = useState('');
  const [posting, setPosting] = useState(false);

  // Night audit
  const [auditRunning, setAuditRunning] = useState(false);
  const [auditSummary, setAuditSummary] = useState<NightAuditSummary | null>(null);

  const refresh = useCallback(async () => {
    const [accts, jes, anoms] = await Promise.all([
      api.get<GLAccount[]>('/gl/accounts'),
      api.get<JournalEntry[]>('/gl/journal-entries'),
      api.get<AnomalyAlert[]>('/ai/anomalies'),
    ]);
    setAccounts(accts);
    setEntries(jes);
    setAnomalies(anoms);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load accounting data');
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  // Ledger balances computed from posted journal lines
  const balances = useMemo(() => {
    const map = new Map<string, { debit: number; credit: number }>();
    for (const e of entries) {
      for (const l of e.lines) {
        const agg = map.get(l.accountId) || { debit: 0, credit: 0 };
        agg.debit += l.debit;
        agg.credit += l.credit;
        map.set(l.accountId, agg);
      }
    }
    return map;
  }, [entries]);

  const balanceOf = (a: GLAccount) => {
    const agg = balances.get(a.id) || { debit: 0, credit: 0 };
    return a.type === 'Asset' || a.type === 'Expense' ? agg.debit - agg.credit : agg.credit - agg.debit;
  };

  const accountByCode = (code: string) => accounts.find(a => a.code === code);
  const cashBalance = accountByCode('1000') ? balanceOf(accountByCode('1000')!) : 0;
  const arBalance = accountByCode('1100') ? balanceOf(accountByCode('1100')!) : 0;
  const roomRevenue = accountByCode('4000') ? balanceOf(accountByCode('4000')!) : 0;

  const draftTotals = useMemo(() => {
    const debit = jeLines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
    const credit = jeLines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
    return { debit, credit, balanced: Math.abs(debit - credit) <= 0.005 && debit > 0 };
  }, [jeLines]);

  const handlePostEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setJeError('');
    if (!draftTotals.balanced) {
      setJeError(`Entry not balanced: debits ${fmt(draftTotals.debit)} ≠ credits ${fmt(draftTotals.credit)}`);
      return;
    }
    const lines = jeLines
      .filter(l => l.accountId && (parseFloat(l.debit) || parseFloat(l.credit)))
      .map(l => ({ accountId: l.accountId, debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0 }));
    if (lines.length < 2) {
      setJeError('At least 2 lines with an account and amount are required.');
      return;
    }
    setPosting(true);
    try {
      await api.post('/gl/journal-entries', { date: jeDate, description: jeDescription || 'Manual journal entry', lines });
      setJeDescription('');
      setJeLines([emptyLine(), emptyLine()]);
      await refresh();
    } catch (err) {
      setJeError(err instanceof Error ? err.message : 'Failed to post journal entry');
    } finally {
      setPosting(false);
    }
  };

  const handleNightAudit = async () => {
    setAuditRunning(true);
    setError('');
    try {
      const summary = await api.post<NightAuditSummary>('/night-audit');
      setAuditSummary(summary);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Night audit failed');
    } finally {
      setAuditRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="glass-panel p-10 flex items-center justify-center text-sm text-gray-400 animate-slide-up">
        <RefreshCw className="w-4 h-4 mr-2 animate-spin text-amber-400" /> Loading general ledger…
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-100 tracking-tight">Finance & General Ledger</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
              Live ERP Accounting
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Double-entry GL, automated night-audit posting, and AI-driven anomaly detection.
          </p>
        </div>

        <button
          onClick={handleNightAudit}
          disabled={auditRunning}
          className="btn-primary text-xs px-4 py-2.5 disabled:opacity-60"
        >
          <MoonStar className="w-4 h-4" /> {auditRunning ? 'Running Audit…' : 'Run Night Audit'}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Night audit summary */}
      {auditSummary && (
        <div className="glass-panel-gold rounded-xl p-4 text-xs space-y-1">
          <div className="font-bold text-amber-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Night Audit Complete
          </div>
          <p className="text-gray-300">
            Posted room charges to <strong>{auditSummary.foliosPosted}</strong> folio(s) — total room revenue{' '}
            <strong className="text-amber-300">{fmt(auditSummary.totalRoomRevenue)}</strong>
            {auditSummary.journalEntryId ? ` — GL entry ${auditSummary.journalEntryId}` : ' — no in-house guests, no GL entry'}.
          </p>
          <p className="text-gray-500 text-[11px]">Ran at {new Date(auditSummary.ranAt).toLocaleString()}</p>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Cash & Bank</span>
            <Wallet className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-lg font-extrabold text-emerald-300 mt-1">{fmt(cashBalance)}</div>
          <div className="text-[11px] text-gray-500">GL 1000</div>
        </div>
        <div className="glass-panel p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">AR Guest Ledger</span>
            <Landmark className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-lg font-extrabold text-amber-300 mt-1">{fmt(arBalance)}</div>
          <div className="text-[11px] text-gray-500">GL 1100</div>
        </div>
        <div className="glass-panel p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Rooms Revenue (Posted)</span>
            <BookOpen className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-lg font-extrabold text-purple-300 mt-1">{fmt(roomRevenue)}</div>
          <div className="text-[11px] text-gray-500">GL 4000</div>
        </div>
        <div className="glass-panel p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">RevPAR Today</span>
            <Sparkles className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-lg font-extrabold text-cyan-300 mt-1">{metrics ? fmt(metrics.revPar) : '—'}</div>
          <div className="text-[11px] text-gray-500">{metrics ? `Occ ${metrics.occupancyRate}% • ADR ${fmt(metrics.adr)}` : 'Metrics unavailable'}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* GL Accounts */}
        <div className="lg:col-span-5 glass-panel p-5 space-y-3">
          <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
            <Landmark className="w-4 h-4 text-amber-400" /> Chart of Accounts
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 border-b border-white/10">
                  <th className="pb-2 font-bold">Code</th>
                  <th className="pb-2 font-bold">Account</th>
                  <th className="pb-2 font-bold">Type</th>
                  <th className="pb-2 font-bold text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(a => (
                  <tr key={a.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-2 font-mono text-amber-300 font-bold">{a.code}</td>
                    <td className="py-2 text-gray-200">{a.name}</td>
                    <td className="py-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${
                        a.type === 'Asset' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                        : a.type === 'Revenue' ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                        : a.type === 'Expense' ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                        : 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                      }`}>{a.type}</span>
                    </td>
                    <td className="py-2 text-right font-mono text-gray-100">{fmt(balanceOf(a))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* AI Anomaly Detection */}
        <div className="lg:col-span-7 glass-panel p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" /> AI Anomaly Detection
            </h3>
            <span className="text-[11px] text-gray-400">{anomalies.length} finding(s)</span>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {anomalies.length === 0 && (
              <div className="p-3 rounded-xl bg-slate-900 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> No anomalies detected across ledgers, rooms, and inventory.
              </div>
            )}
            {anomalies.map((a, i) => (
              <div key={i} className="p-3 rounded-xl bg-slate-900/80 border border-white/10 flex items-start gap-3 text-xs">
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase flex-shrink-0 ${severityStyle(a.severity)}`}>
                  {a.severity}
                </span>
                <p className="text-gray-300 leading-relaxed">{a.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Journal entries */}
        <div className="lg:col-span-7 glass-panel p-5 space-y-3">
          <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-amber-400" /> Journal Entries
          </h3>
          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {entries.map(e => (
              <div key={e.id} className="p-3 rounded-xl bg-slate-900/80 border border-white/10 text-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-gray-100">{e.description}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full border font-bold bg-white/5 text-gray-400 border-white/10 flex-shrink-0">
                    {e.source}
                  </span>
                </div>
                <div className="text-[11px] text-gray-500 font-mono">{e.id} • {e.date}</div>
                <table className="w-full text-[11px]">
                  <tbody>
                    {e.lines.map(l => (
                      <tr key={l.id} className="border-t border-white/5">
                        <td className="py-1 text-gray-300">
                          <span className="font-mono text-amber-300/80 mr-1.5">{l.accountCode}</span>{l.accountName}
                        </td>
                        <td className="py-1 text-right font-mono text-emerald-300 w-20">{l.debit ? fmt(l.debit) : ''}</td>
                        <td className="py-1 text-right font-mono text-rose-300 w-20">{l.credit ? fmt(l.credit) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>

        {/* New journal entry */}
        <div className="lg:col-span-5 glass-panel p-5 space-y-4">
          <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
            <Plus className="w-4 h-4 text-amber-400" /> New Journal Entry
          </h3>

          <form onSubmit={handlePostEntry} className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-400 font-semibold mb-1">Date</label>
                <input
                  type="date"
                  value={jeDate}
                  onChange={e => setJeDate(e.target.value)}
                  className="w-full p-2 rounded-lg bg-slate-900 border border-white/10 text-gray-200 focus:outline-none focus:border-amber-400/50"
                  required
                />
              </div>
              <div>
                <label className="block text-gray-400 font-semibold mb-1">Description</label>
                <input
                  type="text"
                  value={jeDescription}
                  onChange={e => setJeDescription(e.target.value)}
                  placeholder="e.g. Owner draw"
                  className="w-full p-2 rounded-lg bg-slate-900 border border-white/10 text-gray-200 focus:outline-none focus:border-amber-400/50"
                />
              </div>
            </div>

            <div className="space-y-2">
              {jeLines.map((line, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={line.accountId}
                    onChange={e => setJeLines(prev => prev.map((l, i) => i === idx ? { ...l, accountId: e.target.value } : l))}
                    className="flex-1 p-2 rounded-lg bg-slate-900 border border-white/10 text-gray-200"
                    required
                  >
                    <option value="">Select account…</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                  <input
                    type="number" min="0" step="0.01" placeholder="Debit"
                    value={line.debit}
                    onChange={e => setJeLines(prev => prev.map((l, i) => i === idx ? { ...l, debit: e.target.value } : l))}
                    className="w-24 p-2 rounded-lg bg-slate-900 border border-white/10 text-emerald-300 font-mono"
                  />
                  <input
                    type="number" min="0" step="0.01" placeholder="Credit"
                    value={line.credit}
                    onChange={e => setJeLines(prev => prev.map((l, i) => i === idx ? { ...l, credit: e.target.value } : l))}
                    className="w-24 p-2 rounded-lg bg-slate-900 border border-white/10 text-rose-300 font-mono"
                  />
                  {jeLines.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setJeLines(prev => prev.filter((_, i) => i !== idx))}
                      className="text-gray-500 hover:text-rose-300 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setJeLines(prev => [...prev, emptyLine()])}
                className="text-[11px] text-amber-300 hover:text-amber-200 font-semibold"
              >
                + Add line
              </button>
            </div>

            <div className={`flex items-center justify-between p-2.5 rounded-lg border text-[11px] font-bold ${
              draftTotals.balanced
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}>
              <span>Dr {fmt(draftTotals.debit)} / Cr {fmt(draftTotals.credit)}</span>
              <span>{draftTotals.balanced ? 'Balanced ✓' : 'Out of balance'}</span>
            </div>

            {jeError && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/40 text-rose-300 text-[11px] font-semibold">
                {jeError}
              </div>
            )}

            <button type="submit" disabled={posting} className="btn-primary text-xs w-full py-2.5 justify-center disabled:opacity-60">
              <Plus className="w-4 h-4" /> {posting ? 'Posting…' : 'Post Journal Entry'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
