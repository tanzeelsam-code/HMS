import React from 'react';
import { PropertyComparison } from '../types';
import { Building2 } from 'lucide-react';

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 surface-panel bg-white p-5 border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Multi-Property Portfolio Analytics & CRS</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
              Cross-Property Executive View
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1 font-medium">
            Compare side-by-side RevPAR, ADR, Occupancy %, and GOPPAR across all properties in your hotel group.
          </p>
        </div>

        <div className="text-right">
          <div className="text-xs font-bold text-slate-500">Properties Reporting</div>
          <div className="text-2xl font-extrabold text-amber-900 font-mono">
            {properties.length}
          </div>
          <div className="text-[10px] font-semibold text-slate-500">Revenue remains in local currency until FX consolidation is configured.</div>
        </div>
      </div>

      {/* Property Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {properties.map((p, idx) => (
          <div key={idx} className="surface-panel bg-white p-5 space-y-4 border border-slate-200 shadow-xs hover:border-amber-300 transition-all text-xs">
            <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-300 flex items-center justify-center text-amber-800 font-bold text-base flex-shrink-0">
                <Building2 className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 truncate">{p.propertyName}</h3>
                <div className="text-[11px] font-semibold text-slate-500">{p.totalRooms} Rooms Inventory</div>
              </div>
            </div>

            <div className="space-y-2 font-semibold">
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">Occupancy %</span>
                <span className="font-extrabold text-emerald-800">{p.occupancyRate}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">ADR (Avg Rate)</span>
                <span className="font-extrabold text-slate-900">{formatMoney(p.adr, p.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">RevPAR</span>
                <span className="font-extrabold text-amber-900 font-mono">{formatMoney(p.revPar, p.currency)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2">
                <span className="text-slate-500 font-bold">GOPPAR (Gross Operating Profit)</span>
                <span className="font-extrabold text-purple-900 font-mono">{formatMoney(p.goppar, p.currency)}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
              <div className="text-[10px] font-bold text-slate-500 uppercase">Today's Gross Revenue</div>
              <div className="text-base font-extrabold text-emerald-800 font-mono mt-0.5">{formatMoney(p.totalRevenue, p.currency)}</div>
              {p.source && <div className="text-[10px] font-semibold text-slate-500 mt-1">{p.source}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
