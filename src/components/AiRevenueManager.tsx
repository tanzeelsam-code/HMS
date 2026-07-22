import React, { useEffect, useState } from 'react';
import { DynamicPricingRule, PricingForecast, DemandForecastDay } from '../types';
import { api } from '../api';
import { Sparkles, TrendingUp, Zap, ShieldAlert, CheckCircle2, ArrowUpRight, DollarSign, Sliders, BrainCircuit, CalendarDays, RefreshCw } from 'lucide-react';

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
  const [marketDemandScore] = useState(88); // 88/100 High demand score
  const [forecast, setForecast] = useState<PricingForecast[]>([]);
  const [demand, setDemand] = useState<DemandForecastDay[]>([]);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [forecastError, setForecastError] = useState('');

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-100 tracking-tight">AI Dynamic Pricing & Revenue Optimization</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/30">
              Autonomous Yield Engine
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Machine learning algorithm analyzing occupancy velocity, competitor rates, local event calendars, and booking lead time.
          </p>
        </div>

        {/* Live Market Demand Score Banner */}
        <div className="flex items-center gap-4 bg-slate-900/90 px-4 py-2 rounded-xl border border-purple-500/30 shadow-lg shadow-purple-500/10">
          <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 font-black text-base">
            88
          </div>
          <div>
            <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Market Demand Index</div>
            <div className="text-xs font-extrabold text-purple-300 flex items-center gap-1">
              High Surge Demand (+22% RevPAR)
            </div>
          </div>
        </div>
      </div>

      {/* Live AI Pricing Forecast */}
      <div className="glass-panel p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-purple-400" /> Live AI Pricing Forecast
          </h3>
          <span className="text-xs text-gray-400">Computed live from bookings on the books (14-day horizon)</span>
        </div>

        {forecastLoading && (
          <div className="p-6 flex items-center justify-center text-xs text-gray-400">
            <RefreshCw className="w-4 h-4 mr-2 animate-spin text-purple-400" /> Computing live forecast…
          </div>
        )}

        {forecastError && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs font-semibold">
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
                    className="p-4 rounded-xl bg-slate-900/70 border border-white/10 space-y-3 hover:border-purple-400/40 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-extrabold text-sm text-gray-100">{f.roomType}</h4>
                        <div className="flex items-center gap-3 text-xs text-gray-400 mt-1 flex-wrap">
                          <span>Base: <strong className="text-gray-300">${f.baseRate.toFixed(0)}</strong></span>
                          <span>• Demand: <strong className="text-purple-300 font-bold">{f.demandMultiplier}x</strong></span>
                          <span>• 14d Occ: <strong className="text-cyan-300 font-bold">{f.occupancyForecast}%</strong></span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-[10px] text-gray-400 uppercase font-bold">AI Rate</div>
                        <div className="text-base font-extrabold text-amber-300">
                          ${f.recommendedRate}
                          <span className={`text-[10px] font-bold ml-1 ${diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            ({diff >= 0 ? '+' : ''}{pct}%)
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Occupancy forecast bar */}
                    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-400"
                        style={{ width: `${Math.min(100, f.occupancyForecast)}%` }}
                      />
                    </div>

                    <ul className="space-y-1 text-[11px] text-gray-400 leading-relaxed">
                      {f.reasoning.map((r, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span className="text-purple-400 flex-shrink-0">▸</span>{r}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            {/* 14-day demand strip */}
            <div className="pt-2 border-t border-white/10 space-y-2">
              <div className="text-xs font-bold text-gray-100 flex items-center gap-2">
                <CalendarDays className="w-3.5 h-3.5 text-cyan-400" /> 14-Day Demand Outlook
              </div>
              <div className="flex items-end gap-1.5 h-24">
                {demand.map(d => (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group" title={`${d.date}: ${d.expectedOccupancy}% occupancy, ${d.arrivals} arrival(s)`}>
                    <span className="text-[9px] font-mono text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      {d.expectedOccupancy}%
                    </span>
                    <div className="w-full rounded-t bg-gradient-to-t from-cyan-500/40 to-cyan-400/80 hover:to-amber-400/80 transition-colors"
                      style={{ height: `${Math.max(4, d.expectedOccupancy)}%` }}
                    />
                    <span className="text-[9px] font-mono text-gray-500">{d.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Dynamic Rate Recommendations Table */}
      <div className="glass-panel p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" /> AI Rate Optimization Recommendations
          </h3>
          <span className="text-xs text-gray-400">Auto-pilot active for eligible categories</span>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {rules.map((rule) => {
            const rateDiff = rule.recommendedRate - rule.baseRate;
            const percentageIncrease = Math.round((rateDiff / rule.baseRate) * 100);

            return (
              <div 
                key={rule.id}
                className="p-4 rounded-xl bg-slate-900/70 border border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:border-purple-400/40 transition-all"
              >
                {/* Room Category & Factors */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 font-extrabold text-base flex-shrink-0">
                    +{percentageIncrease}%
                  </div>

                  <div>
                    <h4 className="font-extrabold text-sm text-gray-100">{rule.roomType}</h4>
                    <div className="flex items-center gap-3 text-xs text-gray-400 mt-1 flex-wrap">
                      <span>Base Rate: <strong className="text-gray-300">${rule.baseRate}</strong></span>
                      <span>• Competitor Avg: <strong className="text-gray-300">${rule.competitorAvgRate}</strong></span>
                      <span>• Demand Multiplier: <strong className="text-purple-300 font-bold">{rule.demandFactor}x</strong></span>
                    </div>
                  </div>
                </div>

                {/* Rates Comparison & Controls */}
                <div className="flex items-center justify-between lg:justify-end gap-6 pt-3 lg:pt-0 border-t lg:border-t-0 border-white/10">
                  <div className="text-left lg:text-right">
                    <div className="text-[10px] text-gray-400 uppercase font-bold">AI Optimized Rate</div>
                    <div className="text-base font-extrabold text-amber-300 flex items-center gap-1">
                      ${rule.recommendedRate}
                      <span className="text-[10px] text-emerald-400 font-bold">(${rateDiff > 0 ? `+${rateDiff}` : rateDiff})</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => onToggleAutoApply(rule.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                        rule.autoApply 
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' 
                          : 'bg-slate-800 text-gray-400 border-white/10'
                      }`}
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      {rule.autoApply ? 'Auto-Pilot ON' : 'Manual Mode'}
                    </button>

                    <button
                      onClick={() => onApplyRecommendedRate(rule.id)}
                      className="btn-primary text-xs px-3 py-1.5"
                    >
                      <Zap className="w-3.5 h-3.5" /> Apply Rate
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
