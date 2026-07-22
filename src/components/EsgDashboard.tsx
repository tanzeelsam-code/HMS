import React from 'react';
import { EsgMetric } from '../types';
import { Leaf, Zap, Droplets, Sun, CheckCircle2, ShieldCheck, Thermometer } from 'lucide-react';

interface EsgDashboardProps {
  metric: EsgMetric;
  onTriggerHvacSetback: () => void;
}

export const EsgDashboard: React.FC<EsgDashboardProps> = ({
  metric,
  onTriggerHvacSetback
}) => {
  const handleTriggerSetback = () => {
    onTriggerHvacSetback();
  };

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-100 tracking-tight">ESG & Smart Energy Control</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
              Persisted Metrics · Connector-ready
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Track sustainability readings and queue controlled HVAC actions. The current dataset is illustrative; device execution waits for a configured building-management connector.
          </p>
        </div>

        <button 
          onClick={handleTriggerSetback}
          className="btn-primary text-xs bg-gradient-to-r from-emerald-500 to-teal-600 shadow-emerald-500/20"
        >
          <Leaf className="w-3.5 h-3.5" /> Queue HVAC Setback
        </button>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div className="glass-panel p-5 space-y-2 border-l-4 border-l-emerald-400">
          <div className="flex items-center justify-between text-gray-400">
            <span className="font-semibold uppercase">Carbon Footprint</span>
            <Leaf className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-gray-100 font-mono">
            {metric.carbonPerOccupiedRoomKg} <span className="text-xs text-gray-400">kg/room</span>
          </div>
          <div className="text-[11px] text-emerald-400 font-semibold">Illustrative benchmark comparison</div>
        </div>

        <div className="glass-panel p-5 space-y-2 border-l-4 border-l-yellow-400">
          <div className="flex items-center justify-between text-gray-400">
            <span className="font-semibold uppercase">Energy Saved (Today)</span>
            <Zap className="w-4 h-4 text-yellow-400" />
          </div>
          <div className="text-2xl font-extrabold text-gray-100 font-mono">
            {metric.energyKwhSaved} <span className="text-xs text-gray-400">kWh</span>
          </div>
          <div className="text-[11px] text-amber-300 font-semibold">Sample savings calculation</div>
        </div>

        <div className="glass-panel p-5 space-y-2 border-l-4 border-l-blue-400">
          <div className="flex items-center justify-between text-gray-400">
            <span className="font-semibold uppercase">HVAC Eco Setbacks</span>
            <Thermometer className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-extrabold text-gray-100 font-mono">
            {metric.hvacAutoSetbacksTriggered} <span className="text-xs text-gray-400">Recorded</span>
          </div>
          <div className="text-[11px] text-cyan-300 font-semibold">Illustrative control-rule assumption</div>
        </div>

        <div className="glass-panel p-5 space-y-2 border-l-4 border-l-purple-400">
          <div className="flex items-center justify-between text-gray-400">
            <span className="font-semibold uppercase">Renewable Energy</span>
            <Sun className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-extrabold text-gray-100 font-mono">
            {metric.renewableEnergyPercentage}%
          </div>
          <div className="text-[11px] text-purple-300 font-semibold">Sample renewable-energy mix</div>
        </div>
      </div>
    </div>
  );
};
