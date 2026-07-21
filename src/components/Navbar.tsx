import React, { useState } from 'react';
import { 
  Building2, Search, Bell, Sparkles, UserCheck, Moon, RefreshCw, 
  Calendar, CheckCircle2, ChevronDown, Flame, ShieldAlert
} from 'lucide-react';
import { HotelMetrics } from '../types';

interface NavbarProps {
  metrics: HotelMetrics;
  onOpenNewBooking: () => void;
  onRunNightAudit: () => void;
  selectedProperty: string;
  setSelectedProperty: (prop: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  metrics,
  onOpenNewBooking,
  onRunNightAudit,
  selectedProperty,
  setSelectedProperty
}) => {
  const [showPropertyDropdown, setShowPropertyDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const properties = [
    'Nexus Luxury Resort & Spa (Main Property)',
    'Nexus Boutique Suites & Villas',
    'Nexus Grand Executive Hotel'
  ];

  return (
    <header className="sticky top-0 z-40 w-full glass-panel rounded-none border-t-0 border-x-0 px-6 py-3.5 flex items-center justify-between shadow-2xl">
      {/* Brand & Property Selector */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-200 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-black text-xl tracking-tighter">
            N
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight text-gold-gradient">
                NEXUS
              </span>
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/20">
                Hotel OS
              </span>
            </div>
            <p className="text-[11px] text-gray-400 font-medium">AI Operating System</p>
          </div>
        </div>

        <div className="h-6 w-[1px] bg-white/10 hidden md:block" />

        {/* Multi-Property Switcher Dropdown */}
        <div className="relative hidden md:block">
          <button 
            onClick={() => setShowPropertyDropdown(!showPropertyDropdown)}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-900/60 hover:bg-slate-800/80 border border-white/10 text-xs font-semibold text-gray-200 transition-all"
          >
            <Building2 className="w-4 h-4 text-amber-400" />
            <span className="max-w-[220px] truncate">{selectedProperty}</span>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </button>

          {showPropertyDropdown && (
            <div className="absolute top-full left-0 mt-2 w-72 glass-panel p-2 z-50 animate-slide-up shadow-2xl">
              <div className="px-3 py-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                Select Active Property
              </div>
              {properties.map((prop) => (
                <button
                  key={prop}
                  onClick={() => {
                    setSelectedProperty(prop);
                    setShowPropertyDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-md text-xs font-medium transition-all flex items-center justify-between ${
                    selectedProperty === prop 
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' 
                      : 'text-gray-300 hover:bg-white/5'
                  }`}
                >
                  <span className="truncate">{prop}</span>
                  {selectedProperty === prop && <CheckCircle2 className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Live Occupancy Meter & Quick Search */}
      <div className="hidden lg:flex items-center gap-6">
        <div className="flex items-center gap-3 px-4 py-1.5 rounded-full bg-slate-900/80 border border-white/10">
          <Flame className="w-4 h-4 text-amber-400 animate-pulse" />
          <span className="text-xs text-gray-400 font-medium">Live Occupancy:</span>
          <span className="text-xs font-bold text-emerald-400">{metrics.occupancyRate}%</span>
          <div className="w-20 h-2 bg-slate-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-emerald-500 to-amber-400 rounded-full transition-all duration-500" 
              style={{ width: `${metrics.occupancyRate}%` }}
            />
          </div>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="Search room, guest, or reservation..." 
            className="w-64 pl-9 pr-4 py-1.5 rounded-lg bg-slate-900/60 border border-white/10 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-400/50 transition-all"
          />
        </div>
      </div>

      {/* Action Buttons & Profile */}
      <div className="flex items-center gap-3">
        <button 
          onClick={onRunNightAudit}
          className="btn-secondary text-xs px-3 py-1.5 hidden sm:flex items-center gap-1.5"
          title="Trigger Automated Daily Financial Audit"
        >
          <Moon className="w-3.5 h-3.5 text-indigo-400" />
          <span>Night Audit</span>
        </button>

        <button 
          onClick={onOpenNewBooking}
          className="btn-primary text-xs px-3.5 py-1.5"
        >
          <Calendar className="w-4 h-4" />
          <span>New Reservation</span>
        </button>

        {/* Notifications */}
        <div className="relative">
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 rounded-lg bg-slate-900/60 hover:bg-slate-800 text-gray-300 relative border border-white/10"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full ring-2 ring-slate-950 animate-ping" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full ring-2 ring-slate-950" />
          </button>

          {showNotifications && (
            <div className="absolute top-full right-0 mt-2 w-80 glass-panel p-3 z-50 animate-slide-up shadow-2xl">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                <span className="text-xs font-bold text-gray-200">System Notifications</span>
                <span className="text-[10px] text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full font-semibold">3 New</span>
              </div>
              <div className="space-y-2">
                <div className="p-2 rounded bg-slate-900/80 border border-emerald-500/20 text-xs">
                  <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Self Check-in Completed
                  </div>
                  <p className="text-gray-400 text-[11px] mt-0.5">Guest Alexander Wright (101) uploaded ID & generated digital key.</p>
                </div>
                <div className="p-2 rounded bg-slate-900/80 border border-amber-500/20 text-xs">
                  <div className="font-semibold text-amber-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> AI Dynamic Price Alert
                  </div>
                  <p className="text-gray-400 text-[11px] mt-0.5">Weekend demand surge detected. Recommended rate increase: +18%.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="flex items-center gap-2 pl-2 border-l border-white/10">
          <div className="w-8 h-8 rounded-lg bg-slate-800 border border-amber-400/30 flex items-center justify-center text-xs font-bold text-amber-300">
            GM
          </div>
          <div className="hidden xl:block text-left">
            <div className="text-xs font-semibold text-gray-200">General Manager</div>
            <div className="text-[10px] text-gray-400">Shift: Front Desk Admin</div>
          </div>
        </div>
      </div>
    </header>
  );
};
