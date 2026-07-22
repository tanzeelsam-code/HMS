import React from 'react';
import { PropertyComparison } from '../types';
import { Building2, TrendingUp, DollarSign, Users, Award, ShieldCheck } from 'lucide-react';

interface MultiPropertyAnalyticsProps {
  properties: PropertyComparison[];
}

export const MultiPropertyAnalytics: React.FC<MultiPropertyAnalyticsProps> = ({ properties }) => {
  const formatMoney = (value: number, currency = 'USD') => new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-100 tracking-tight">Multi-Property Portfolio Analytics & CRS</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/30">
              Cross-Property Executive View
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Compare side-by-side RevPAR, ADR, Occupancy %, and GOPPAR across all properties in your hotel group.
          </p>
        </div>

        <div className="text-right">
          <div className="text-xs text-gray-400">Properties Reporting</div>
          <div className="text-2xl font-extrabold text-amber-300 font-mono">
            {properties.length}
          </div>
          <div className="text-[10px] text-gray-500">Revenue remains in local currency until FX consolidation is configured.</div>
        </div>
      </div>

      {/* Property Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {properties.map((p, idx) => (
          <div key={idx} className="glass-panel p-5 space-y-4 hover:border-amber-400/40 transition-all text-xs">
            <div className="flex items-center gap-3 border-b border-white/10 pb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-400/30 flex items-center justify-center text-amber-400 font-bold text-base flex-shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-gray-100 truncate">{p.propertyName}</h3>
                <div className="text-[11px] text-gray-400">{p.totalRooms} Rooms Inventory</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Occupancy %</span>
                <span className="font-bold text-emerald-400">{p.occupancyRate}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">ADR (Avg Rate)</span>
                <span className="font-bold text-gray-200">{formatMoney(p.adr, p.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">RevPAR</span>
                <span className="font-bold text-amber-300 font-mono">{formatMoney(p.revPar, p.currency)}</span>
              </div>
              <div className="flex justify-between border-t border-white/5 pt-2">
                <span className="text-gray-400">GOPPAR (Gross Operating Profit)</span>
                <span className="font-bold text-purple-300 font-mono">{formatMoney(p.goppar, p.currency)}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/90 border border-white/5 text-center">
              <div className="text-[10px] text-gray-400">Today's Gross Revenue</div>
              <div className="text-base font-extrabold text-emerald-400 font-mono mt-0.5">{formatMoney(p.totalRevenue, p.currency)}</div>
              {p.source && <div className="text-[10px] text-gray-500 mt-1">{p.source}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
