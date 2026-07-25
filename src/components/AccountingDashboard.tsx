import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { GLAccount, JournalEntry, AnomalyAlert, NightAuditSummary, HotelMetrics } from '../types';
import {
  Landmark, Wallet, BookOpen, Plus, Trash2, ShieldAlert, Sparkles,
  MoonStar, CheckCircle2, RefreshCw, AlertTriangle
} from 'lucide-react';

interface AccountingDashboardProps {
  metrics: HotelMetrics | null;
  onDataChanged?: () => void | Promise<void>;
}

interface DraftLine {
  accountId: string;
  debit: string;
  credit: string;
}

const emptyLine = (): DraftLine => ({ accountId: '', debit: '', credit: '' });

const severityStyle = (sev: AnomalyAlert['severity']) =>
  sev.toLowerCase() === 'high'
    ? 'bg-rose-100 text-rose-800 border-rose-200'
    : sev.toLowerCase() === 'medium'
      ? 'bg-amber-100 text-amber-900 border-amber-200'
      : 'bg-blue-100 text-blue-900 border-blue-200';

const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const AccountingDashboard: React.FC<AccountingDashboardProps> = ({ metrics, onDataChanged }) => {
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // New journal entry form
  const [jeDate, setJeDate] = useState(() => metrics?.businessDate || new Date().toISOString().slice(0, 10));
  const [jeDescription, setJeDescription] = useState('');
  const [jeLines, setJeLines] = useState<DraftLine[]>([emptyLine(), emptyLine()]);
  const [jeError, setJeError] = useState('');
  const [posting, setPosting] = useState(false);

  // Night audit
  const [auditRunning, setAuditRunning] = useState(false);
  const [auditSummary, setAuditSummary] = useState<NightAuditSummary | null>(null);

  const refresh = useCallback(async () => {
    const asOf = metrics?.businessDate;
    const [accts, jes, anoms] = await Promise.all([
      api.get<GLAccount[]>('/gl/accounts'),
      api.get<JournalEntry[]>(`/gl/journal-entries${asOf ? `?asOf=${encodeURIComponent(asOf)}` : ''}`),
      api.get<AnomalyAlert[]>('/ai/anomalies'),
    ]);
    setAccounts(accts);
    setEntries(jes);
    setAnomalies(anoms);
  }, [metrics?.businessDate]);

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
      await onDataChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Night audit failed');
    } finally {
      setAuditRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="surface-panel bg-white p-10 flex items-center justify-center text-sm font-semibold text-slate-500 border border-slate-200 animate-slide-up">
        <RefreshCw className="w-4 h-4 mr-2 animate-spin text-amber-600" /> Loading general ledger…
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 surface-panel bg-white p-5 border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Finance & General Ledger</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
              As of {metrics?.businessDate || 'current business date'}
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Double-entry GL, idempotent night-audit posting, and rule-based anomaly detection. Future-dated entries are excluded from these balances.
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
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600" /> {error}
        </div>
      )}

      {/* Night audit summary */}
      {auditSummary && (
        <div className="rounded-xl p-4 text-xs space-y-1 bg-amber-50 border border-amber-300 shadow-xs">
          <div className="font-bold text-amber-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-amber-600" /> Night Audit Complete
          </div>
          <p className="text-slate-800 font-medium">
            Posted room charges to <strong className="text-slate-900">{auditSummary.foliosPosted}</strong> folio(s) — total room revenue{' '}
            <strong className="text-amber-800 font-bold">{fmt(auditSummary.totalRoomRevenue)}</strong>
            {auditSummary.journalEntryId ? ` — GL entry ${auditSummary.journalEntryId}` : ' — no in-house guests, no GL entry'}.
          </p>
          <p className="text-slate-500 text-[11px] font-medium">Ran at {new Date(auditSummary.ranAt).toLocaleString()}</p>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="surface-panel bg-white p-4 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Cash & Bank</span>
            <Wallet className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-extrabold text-emerald-700 mt-1">{fmt(cashBalance)}</div>
          <div className="text-[11px] text-slate-500 font-semibold">GL 1000</div>
        </div>
        <div className="surface-panel bg-white p-4 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">AR Guest Ledger</span>
            <Landmark className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl font-extrabold text-amber-800 mt-1">{fmt(arBalance)}</div>
          <div className="text-[11px] text-slate-500 font-semibold">GL 1100</div>
        </div>
        <div className="surface-panel bg-white p-4 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Rooms Revenue (Posted)</span>
            <BookOpen className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-xl font-extrabold text-purple-800 mt-1">{fmt(roomRevenue)}</div>
          <div className="text-[11px] text-slate-500 font-semibold">GL 4000</div>
        </div>
        <div className="surface-panel bg-white p-4 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">RevPAR Today</span>
            <Sparkles className="w-4 h-4 text-cyan-600" />
          </div>
          <div className="text-xl font-extrabold text-cyan-800 mt-1">{metrics ? fmt(metrics.revPar) : '—'}</div>
          <div className="text-[11px] text-slate-500 font-medium">{metrics ? `Occ ${metrics.occupancyRate}% • ADR ${fmt(metrics.adr)}` : 'Metrics unavailable'}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* GL Accounts */}
        <div className="lg:col-span-5 surface-panel bg-white p-5 space-y-3 border border-slate-200 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Landmark className="w-4 h-4 text-amber-600" /> Chart of Accounts
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="pb-2 font-bold">Code</th>
                  <th className="pb-2 font-bold">Account</th>
                  <th className="pb-2 font-bold">Type</th>
                  <th className="pb-2 font-bold text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map(a => (
                  <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 font-mono text-amber-900 font-bold bg-amber-50/60 px-1.5 rounded">{a.code}</td>
                    <td className="py-2.5 text-slate-900 font-bold">{a.name}</td>
                    <td className="py-2.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${
                        a.type === 'Asset' ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : a.type === 'Revenue' ? 'bg-purple-50 text-purple-800 border-purple-200'
                        : a.type === 'Expense' ? 'bg-rose-50 text-rose-800 border-rose-200'
                        : 'bg-blue-50 text-blue-800 border-blue-200'
                      }`}>{a.type}</span>
                    </td>
                    <td className="py-2.5 text-right font-mono font-bold text-slate-900">{fmt(balanceOf(a))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* AI Anomaly Detection */}
        <div className="lg:col-span-7 surface-panel bg-white p-5 space-y-3 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600" /> AI Anomaly Detection
            </h3>
            <span className="text-[11px] text-slate-500 font-semibold">{anomalies.length} finding(s)</span>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {anomalies.length === 0 && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> No anomalies detected across ledgers, rooms, and inventory.
              </div>
            )}
            {anomalies.map((a, i) => (
              <div key={i} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3 text-xs">
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase flex-shrink-0 ${severityStyle(a.severity)}`}>
                  {a.severity}
                </span>
                <p className="text-slate-800 font-semibold leading-relaxed">{a.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Journal entries */}
        <div className="lg:col-span-7 surface-panel bg-white p-5 space-y-3 border border-slate-200 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-amber-600" /> Journal Entries
          </h3>
          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {entries.map(e => (
              <div key={e.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900">{e.description}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full border font-bold bg-white text-slate-700 border-slate-300 flex-shrink-0">
                    {e.source}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 font-mono font-medium">{e.id} • {e.date}</div>
                <table className="w-full text-[11px] border-collapse">
                  <tbody>
                    {e.lines.map(l => (
                      <tr key={l.id} className="border-t border-slate-200">
                        <td className="py-1 text-slate-800 font-medium">
                          <span className="font-mono text-amber-800 font-bold mr-1.5">{l.accountCode}</span>{l.accountName}
                        </td>
                        <td className="py-1 text-right font-mono font-bold text-emerald-700 w-20">{l.debit ? fmt(l.debit) : ''}</td>
                        <td className="py-1 text-right font-mono font-bold text-rose-700 w-20">{l.credit ? fmt(l.credit) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>

        {/* New journal entry */}
        <div className="lg:col-span-5 surface-panel bg-white p-5 space-y-4 border border-slate-200 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Plus className="w-4 h-4 text-amber-600" /> New Journal Entry
          </h3>

          <form onSubmit={handlePostEntry} className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Date</label>
                <input
                  type="date"
                  value={jeDate}
                  onChange={e => setJeDate(e.target.value)}
                  className="field-control text-xs"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-700 font-bold mb-1">Description</label>
                <input
                  type="text"
                  value={jeDescription}
                  onChange={e => setJeDescription(e.target.value)}
                  placeholder="e.g. Owner draw"
                  className="field-control text-xs"
                />
              </div>
            </div>

            <div className="space-y-2">
              {jeLines.map((line, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={line.accountId}
                    onChange={e => setJeLines(prev => prev.map((l, i) => i === idx ? { ...l, accountId: e.target.value } : l))}
                    className="field-control text-xs flex-1"
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
                    className="field-control text-xs w-24 font-mono font-bold text-emerald-700"
                  />
                  <input
                    type="number" min="0" step="0.01" placeholder="Credit"
                    value={line.credit}
                    onChange={e => setJeLines(prev => prev.map((l, i) => i === idx ? { ...l, credit: e.target.value } : l))}
                    className="field-control text-xs w-24 font-mono font-bold text-rose-700"
                  />
                  {jeLines.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setJeLines(prev => prev.filter((_, i) => i !== idx))}
                      className="text-slate-400 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setJeLines(prev => [...prev, emptyLine()])}
                className="text-[11px] text-amber-700 hover:text-amber-900 font-bold"
              >
                + Add line
              </button>
            </div>

            <div className={`flex items-center justify-between p-2.5 rounded-lg border text-[11px] font-bold ${
              draftTotals.balanced
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}>
              <span>Dr {fmt(draftTotals.debit)} / Cr {fmt(draftTotals.credit)}</span>
              <span>{draftTotals.balanced ? 'Balanced ✓' : 'Out of balance'}</span>
            </div>

            {jeError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-bold">
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
