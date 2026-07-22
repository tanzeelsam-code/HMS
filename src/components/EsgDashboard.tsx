import React, { useState } from 'react';
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
  const [hvacCount, setHvacCount] = useState(metric.hvacAutoSetbacksTriggered);

  const handleTriggerSetback = () => {
    setHvacCount(prev => prev + 1);
    onTriggerHvacSetback();
  };

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-100 tracking-tight">ESG & Smart Energy Management</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
              EU Green Tourism Compliance
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Real-time carbon intensity per occupied room night, water conservation tracking, and automated HVAC setbacks.
          </p>
        </div>

        <button 
          onClick={handleTriggerSetback}
          className="btn-primary text-xs bg-gradient-to-r from-emerald-500 to-teal-600 shadow-emerald-500/20"
        >
          <Leaf className="w-3.5 h-3.5" /> Auto HVAC Eco Setback
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
          <div className="text-[11px] text-emerald-400 font-semibold">-24% lower than industry avg</div>
        </div>

        <div className="glass-panel p-5 space-y-2 border-l-4 border-l-yellow-400">
          <div className="flex items-center justify-between text-gray-400">
            <span className="font-semibold uppercase">Energy Saved (Today)</span>
            <Zap className="w-4 h-4 text-yellow-400" />
          </div>
          <div className="text-2xl font-extrabold text-gray-100 font-mono">
            {metric.energyKwhSaved} <span className="text-xs text-gray-400">kWh</span>
          </div>
          <div className="text-[11px] text-amber-300 font-semibold">$145 saved on power bill</div>
        </div>

        <div className="glass-panel p-5 space-y-2 border-l-4 border-l-blue-400">
          <div className="flex items-center justify-between text-gray-400">
            <span className="font-semibold uppercase">HVAC Eco Setbacks</span>
            <Thermometer className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-extrabold text-gray-100 font-mono">
            {hvacCount} <span className="text-xs text-gray-400">Rooms Active</span>
          </div>
          <div className="text-[11px] text-cyan-300 font-semibold">Cuts unoccupied HVAC load by 45%</div>
        </div>

        <div className="glass-panel p-5 space-y-2 border-l-4 border-l-purple-400">
          <div className="flex items-center justify-between text-gray-400">
            <span className="font-semibold uppercase">Renewable Energy</span>
            <Sun className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-extrabold text-gray-100 font-mono">
            {metric.renewableEnergyPercentage}%
          </div>
          <div className="text-[11px] text-purple-300 font-semibold">Solar Rooftop + Hydro Array</div>
        </div>
      </div>
    </div>
  );
};
