import React, { useEffect, useState } from 'react';
import { DynamicPricingRule, PricingForecast, DemandForecastDay } from '../types';
import { api } from '../api';
import { Sparkles, Zap, Sliders, BrainCircuit, CalendarDays, RefreshCw } from 'lucide-react';

interface AiRevenueManagerProps {
  rules: DynamicPricingRule[];
  onToggleAutoApply: (ruleId: string) => void;
  onApplyRecommendedRate: (ruleId: string) => void;
}

export const AiRevenueManager: React.FC<AiRevenueManagerProps> = ({
  rules,
  onToggleAutoApply,
  onApplyRecommendedRate
}) => {
  const [forecast, setForecast] = useState<PricingForecast[]>([]);
  const [demand, setDemand] = useState<DemandForecastDay[]>([]);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [forecastError, setForecastError] = useState('');
  const averageOccupancy = demand.length
    ? Math.round(demand.reduce((sum, day) => sum + day.expectedOccupancy, 0) / demand.length)
    : 0;
  const paceLabel = averageOccupancy >= 75 ? 'High booking pace' : averageOccupancy >= 45 ? 'Moderate booking pace' : 'Low booking pace';

  useEffect(() => {
    (async () => {
      try {
        const [pf, df] = await Promise.all([
          api.get<PricingForecast[]>('/ai/pricing-forecast'),
          api.get<DemandForecastDay[]>('/ai/demand-forecast'),
        ]);
        setForecast(pf);
        setDemand(df);
      } catch (err) {
        setForecastError(err instanceof Error ? err.message : 'Failed to load AI forecast');
      } finally {
        setForecastLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 surface-panel bg-white p-5 border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Rule-Based Pricing & Revenue Forecast</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-800 border border-purple-200">
              Deterministic model
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Transparent 14-day booking-pace calculations using live reservations, room capacity, base rates, and weekend mix.
          </p>
        </div>

        {/* Live Market Demand Score Banner */}
        <div className="flex items-center gap-4 bg-purple-50/80 px-4 py-2 rounded-xl border border-purple-200 shadow-xs">
          <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center text-purple-800 font-black text-base">
            {forecastLoading ? '…' : averageOccupancy}
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">14-day occupancy outlook</div>
            <div className="text-xs font-extrabold text-purple-900 flex items-center gap-1">
              {forecastLoading ? 'Calculating…' : `${paceLabel} · ${averageOccupancy}% average`}
            </div>
          </div>
        </div>
      </div>

      {/* Live AI Pricing Forecast */}
      <div className="surface-panel bg-white p-5 space-y-4 border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-purple-600" /> Live Booking-Pace Pricing Forecast
          </h3>
          <span className="text-xs text-slate-500 font-semibold">Computed live from bookings on the books (14-day horizon)</span>
        </div>

        {forecastLoading && (
          <div className="p-6 flex items-center justify-center text-xs text-slate-500 font-semibold">
            <RefreshCw className="w-4 h-4 mr-2 animate-spin text-purple-600" /> Computing live forecast…
          </div>
        )}

        {forecastError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">
            {forecastError}
          </div>
        )}

        {!forecastLoading && !forecastError && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {forecast.map(f => {
                const diff = f.recommendedRate - f.baseRate;
                const pct = Math.round((diff / f.baseRate) * 100);
                return (
                  <div
                    key={f.roomType}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 hover:border-purple-300 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-extrabold text-sm text-slate-900">{f.roomType}</h4>
                        <div className="flex items-center gap-3 text-xs text-slate-600 mt-1 flex-wrap font-semibold">
                          <span>Base: <strong className="text-slate-900">${f.baseRate.toFixed(0)}</strong></span>
                          <span>• Demand: <strong className="text-purple-800 font-bold">{f.demandMultiplier}x</strong></span>
                          <span>• 14d Occ: <strong className="text-cyan-800 font-bold">{f.occupancyForecast}%</strong></span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-[10px] text-slate-500 uppercase font-bold">Forecast Rate</div>
                        <div className="text-base font-extrabold text-amber-800">
                          ${f.recommendedRate}
                          <span className={`text-[10px] font-bold ml-1 ${diff >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            ({diff >= 0 ? '+' : ''}{pct}%)
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Occupancy forecast bar */}
                    <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-purple-600"
                        style={{ width: `${Math.min(100, f.occupancyForecast)}%` }}
                      />
                    </div>

                    <ul className="space-y-1 text-[11px] text-slate-700 font-semibold leading-relaxed">
                      {f.reasoning.map((r, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span className="text-purple-700 flex-shrink-0 font-bold">▸</span>{r}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            {/* 14-day demand strip */}
            <div className="pt-2 border-t border-slate-200 space-y-2">
              <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <CalendarDays className="w-3.5 h-3.5 text-cyan-600" /> 14-Day Demand Outlook
              </div>
              <div className="flex items-end gap-1.5 h-24 pt-2">
                {demand.map(d => (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group" title={`${d.date}: ${d.expectedOccupancy}% occupancy, ${d.arrivals} arrival(s)`}>
                    <span className="text-[9px] font-mono text-slate-700 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                      {d.expectedOccupancy}%
                    </span>
                    <div className="w-full rounded-t bg-cyan-600/60 hover:bg-amber-500 transition-colors"
                      style={{ height: `${Math.max(8, d.expectedOccupancy)}%` }}
                    />
                    <span className="text-[9px] font-mono text-slate-500 font-bold">{d.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Dynamic Rate Recommendations Table */}
      <div className="surface-panel bg-white p-5 space-y-4 border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-600" /> Configured Pricing Policy Rules
          </h3>
          <span className="text-xs text-slate-500 font-semibold">Apply uses the configured target below, independently of the live forecast above</span>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {rules.map((rule) => {
            const rateDiff = rule.recommendedRate - rule.baseRate;
            const percentageIncrease = Math.round((rateDiff / rule.baseRate) * 100);

            return (
              <div 
                key={rule.id}
                className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:border-purple-300 transition-all"
              >
                {/* Room Category & Factors */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-900 font-extrabold text-base flex-shrink-0">
                    +{percentageIncrease}%
                  </div>

                  <div>
                    <h4 className="font-extrabold text-sm text-slate-900">{rule.roomType}</h4>
                    <div className="flex items-center gap-3 text-xs text-slate-600 mt-1 flex-wrap font-semibold">
                      <span>Base Rate: <strong className="text-slate-900">${rule.baseRate}</strong></span>
                      <span>• Benchmark: <strong className="text-slate-900">${rule.competitorAvgRate}</strong></span>
                      <span>• Multiplier: <strong className="text-purple-800 font-bold">{rule.demandFactor}x</strong></span>
                    </div>
                  </div>
                </div>

                {/* Rates Comparison & Controls */}
                <div className="flex items-center justify-between lg:justify-end gap-6 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-200">
                  <div className="text-left lg:text-right">
                    <div className="text-[10px] text-slate-500 uppercase font-bold">Configured Target Rate</div>
                    <div className="text-base font-extrabold text-amber-800 flex items-center gap-1">
                      ${rule.recommendedRate}
                      <span className="text-[10px] text-emerald-700 font-bold">(${rateDiff > 0 ? `+${rateDiff}` : rateDiff})</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => onToggleAutoApply(rule.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 ${
                        rule.autoApply 
                          ? 'bg-purple-100 text-purple-900 border-purple-300' 
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      {rule.autoApply ? 'Bulk Apply Eligible' : 'Manual Only'}
                    </button>

                    <button
                      onClick={() => onApplyRecommendedRate(rule.id)}
                      className="btn-primary text-xs px-3 py-1.5"
                    >
                      <Zap className="w-3.5 h-3.5" /> Apply Configured Rate
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
