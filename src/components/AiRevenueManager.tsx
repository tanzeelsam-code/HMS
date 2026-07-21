import React, { useState } from 'react';
import { DynamicPricingRule } from '../types';
import { Sparkles, TrendingUp, Zap, ShieldAlert, CheckCircle2, ArrowUpRight, DollarSign, Sliders } from 'lucide-react';

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
