import React, { useEffect, useState } from 'react';
import { HotelMetrics, AnomalyAlert } from '../types';
import { api } from '../api';
import {
  TrendingUp,
  DollarSign,
  Users,
  Moon,
  Award,
  CheckCircle2,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

interface FinancialAnalyticsProps {
  metrics: HotelMetrics;
  onRunNightAudit: () => void;
}

const formatCurrency = (value: number) => value.toLocaleString(undefined, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

export const FinancialAnalytics: React.FC<FinancialAnalyticsProps> = ({ metrics, onRunNightAudit }) => {
  const [anomalies, setAnomalies] = useState<AnomalyAlert[]>([]);
  const [loadingAnomalies, setLoadingAnomalies] = useState(true);
  const [anomalyError, setAnomalyError] = useState('');

  useEffect(() => {
    let active = true;
    api.get<AnomalyAlert[]>('/ai/anomalies')
      .then((items) => {
        if (active) setAnomalies(items);
      })
      .catch((err) => {
        if (active) setAnomalyError(err instanceof Error ? err.message : 'Unable to scan for anomalies');
      })
      .finally(() => {
        if (active) setLoadingAnomalies(false);
      });
    return () => { active = false; };
  }, [metrics]);

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 surface-panel bg-white p-5 border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Financial Performance & RevPAR</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
              Live PMS Metrics
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1 font-medium">
            Current occupancy, room yield, posted daily revenue, and operational anomaly checks.
          </p>
        </div>

        <button onClick={onRunNightAudit} className="btn-primary text-xs font-bold">
          <Moon className="w-3.5 h-3.5" /> Run End-of-Day Night Audit
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="surface-panel bg-white p-5 space-y-2 border border-slate-200 shadow-xs border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span className="uppercase tracking-wider">RevPAR</span>
            <TrendingUp className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">{formatCurrency(metrics.revPar)}</div>
          <div className="text-[11px] font-semibold text-slate-500">ADR × current occupancy</div>
        </div>

        <div className="surface-panel bg-white p-5 space-y-2 border border-slate-200 shadow-xs border-l-4 border-l-blue-500">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span className="uppercase tracking-wider">Average Daily Rate</span>
            <DollarSign className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">{formatCurrency(metrics.adr)}</div>
          <div className="text-[11px] font-semibold text-slate-500">Across occupied rooms</div>
        </div>

        <div className="surface-panel bg-white p-5 space-y-2 border border-slate-200 shadow-xs border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span className="uppercase tracking-wider">Occupancy Rate</span>
            <Users className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">{metrics.occupancyRate}%</div>
          <div className="text-[11px] font-semibold text-slate-500">{metrics.inHouseGuests} in-house guest(s)</div>
        </div>

        <div className="surface-panel bg-white p-5 space-y-2 border border-slate-200 shadow-xs border-l-4 border-l-purple-500">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span className="uppercase tracking-wider">Posted Revenue Today</span>
            <Award className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">{formatCurrency(metrics.totalRevenue)}</div>
          <div className="text-[11px] font-semibold text-slate-500">
            {metrics.arrivalsToday} arrival(s) • {metrics.departuresToday} departure(s)
          </div>
        </div>
      </div>

      <div className="surface-panel bg-white p-5 space-y-4 border border-rose-200 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600" />
            <h3 className="text-sm font-bold text-slate-900">Operational & Ledger Anomaly Scan</h3>
          </div>
          {!loadingAnomalies && !anomalyError && (
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
              anomalies.length > 0
                ? 'bg-rose-50 text-rose-800 border-rose-200'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}>
              {anomalies.length > 0 ? `${anomalies.length} finding(s)` : 'No findings'}
            </span>
          )}
        </div>

        {loadingAnomalies && (
          <div role="status" className="p-3 text-xs font-semibold text-slate-500 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-amber-600" /> Scanning current PMS records…
          </div>
        )}

        {anomalyError && (
          <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">
            {anomalyError}
          </div>
        )}

        {!loadingAnomalies && !anomalyError && anomalies.length === 0 && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> No ledger, room-state, or stock anomalies detected.
          </div>
        )}

        {!loadingAnomalies && anomalies.length > 0 && (
          <div className="space-y-3 text-xs font-semibold">
            {anomalies.map((anomaly, index) => (
              <div key={`${anomaly.message}-${index}`} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-amber-800">{anomaly.severity}</span>
                  <p className="text-slate-800 mt-0.5">{anomaly.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
