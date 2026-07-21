import React, { useState } from 'react';
import { HotelMetrics, AnomalyItem } from '../types';
import { TrendingUp, DollarSign, Users, Moon, Award, CheckCircle2, ShieldAlert, ArrowUpRight, AlertTriangle, Sparkles } from 'lucide-react';
import { INITIAL_ANOMALIES } from '../mockData';

interface FinancialAnalyticsProps {
  metrics: HotelMetrics;
  onRunNightAudit: () => void;
}

export const FinancialAnalytics: React.FC<FinancialAnalyticsProps> = ({
  metrics,
  onRunNightAudit
}) => {
  const [anomalies, setAnomalies] = useState<AnomalyItem[]>(INITIAL_ANOMALIES);

  const handleResolveAnomaly = (id: string) => {
    setAnomalies(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-100 tracking-tight">Financial Performance & RevPAR Analytics</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
              Real-Time USALI Accounting
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Uniform System of Accounts for the Lodging Industry (USALI) metrics: RevPAR, ADR, and Daily Ledger Balance.
          </p>
        </div>

        <button 
          onClick={onRunNightAudit}
          className="btn-primary text-xs"
        >
          <Moon className="w-3.5 h-3.5" /> Run End-of-Day Night Audit
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* RevPAR Card */}
        <div className="glass-panel p-5 space-y-2 border-l-4 border-l-amber-400">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span className="font-semibold uppercase tracking-wider">RevPAR</span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-gray-100 font-mono">${metrics.revPar}</div>
          <div className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3" /> +14.2% vs last week
          </div>
        </div>

        {/* ADR Card */}
        <div className="glass-panel p-5 space-y-2 border-l-4 border-l-blue-400">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span className="font-semibold uppercase tracking-wider">Average Daily Rate (ADR)</span>
            <DollarSign className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-extrabold text-gray-100 font-mono">${metrics.adr}</div>
          <div className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3" /> +8.5% rate yield
          </div>
        </div>

        {/* Occupancy Card */}
        <div className="glass-panel p-5 space-y-2 border-l-4 border-l-emerald-400">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span className="font-semibold uppercase tracking-wider">Occupancy Rate</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-gray-100 font-mono">{metrics.occupancyRate}%</div>
          <div className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3" /> 12 of 14 Rooms Occupied
          </div>
        </div>

        {/* Gross Revenue Card */}
        <div className="glass-panel p-5 space-y-2 border-l-4 border-l-purple-400">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span className="font-semibold uppercase tracking-wider">Gross Revenue (Today)</span>
            <Award className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-extrabold text-gray-100 font-mono">${metrics.totalRevenue.toLocaleString()}</div>
          <div className="text-[11px] text-purple-300 font-semibold">Includes Room + F&B + Spa</div>
        </div>
      </div>

      {/* AI Night Audit Anomaly Scanner Box */}
      <div className="glass-panel p-5 space-y-4 border border-rose-500/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <h3 className="text-sm font-bold text-gray-100">AI Night Audit Anomaly Scanner Safeguard</h3>
          </div>
          <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
            anomalies.length > 0 ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
          }`}>
            {anomalies.length > 0 ? `${anomalies.length} Ledger Issues Detected` : '✓ All Folios Balanced'}
          </span>
        </div>

        {anomalies.length > 0 ? (
          <div className="space-y-3 text-xs">
            {anomalies.map((anom) => (
              <div 
                key={anom.id}
                className="p-3.5 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <div>
                    <div className="font-bold text-gray-200">{anom.type} (Room #{anom.roomNumber})</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">{anom.description}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-amber-300">${anom.amount}</span>
                  <button 
                    onClick={() => handleResolveAnomaly(anom.id)}
                    className="btn-secondary text-[11px] px-2.5 py-1 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/10"
                  >
                    Auto Fix
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> System pre-audit check clean. Ready for 1-click Night Audit.
          </div>
        )}
      </div>

      {/* Revenue Distribution Chart Graphic */}
      <div className="glass-panel p-6 space-y-4">
        <h3 className="text-sm font-bold text-gray-100">Revenue Contribution by Category</h3>
        
        <div className="space-y-3 text-xs">
          <div>
            <div className="flex justify-between text-gray-300 font-semibold mb-1">
              <span>Room Charges & Suites (72%)</span>
              <span className="text-amber-300">$10,692</span>
            </div>
            <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-amber-500 to-yellow-300 rounded-full" style={{ width: '72%' }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-gray-300 font-semibold mb-1">
              <span>Food & Beverage Outlets (18%)</span>
              <span className="text-emerald-300">$2,673</span>
            </div>
            <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-300 rounded-full" style={{ width: '18%' }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-gray-300 font-semibold mb-1">
              <span>Serenity Spa & Add-ons (10%)</span>
              <span className="text-purple-300">$1,485</span>
            </div>
            <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-300 rounded-full" style={{ width: '10%' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
