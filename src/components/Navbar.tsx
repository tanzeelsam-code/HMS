import React, { useState } from 'react';
import { Building2, Search, Bell, Moon, Calendar, Flame, LogOut } from 'lucide-react';
import { HotelMetrics } from '../types';

interface NavbarProps {
  metrics: HotelMetrics;
  onOpenNewBooking: () => void;
  onRunNightAudit: () => void;
  onSearch: (query: string) => void;
  selectedProperty: string;
  onLogout: () => void | Promise<void>;
  userName?: string;
  userRole?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  metrics,
  onOpenNewBooking,
  onRunNightAudit,
  onSearch,
  selectedProperty,
  onLogout,
  userName = 'General Manager',
  userRole = 'Front Desk Admin'
}) => {
  const initials = userName
    .split(' ')
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'GM';
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <header className="sticky top-0 z-40 w-full glass-panel rounded-none border-t-0 border-x-0 px-3 sm:px-6 py-3.5 flex items-center justify-between gap-2 shadow-2xl">
      {/* Brand & Property Selector */}
      <div className="flex items-center gap-2 md:gap-6 min-w-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-200 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-black text-xl tracking-tighter">
            N
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight text-gold-gradient">
                NexusHOS
              </span>
              <span className="hidden sm:inline-flex px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/20">
                Hotel Operating System
              </span>
            </div>
            <p className="hidden sm:block text-[11px] text-gray-400 font-medium">Local operations dashboard</p>
          </div>
        </div>

        <div className="h-6 w-[1px] bg-white/10 hidden md:block" />

        <div className="hidden md:flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-white/10 text-xs font-semibold text-gray-200">
          <Building2 className="w-4 h-4 text-amber-400" />
          <span className="max-w-[220px] truncate">{selectedProperty}</span>
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

        {['General Manager', 'Front Desk', 'Finance'].includes(userRole) && (
          <form
            className="relative"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              if (searchQuery.trim()) onSearch(searchQuery.trim());
            }}
          >
            <label htmlFor="global-hotel-search" className="sr-only">Search guests, rooms, or reservation codes</label>
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="global-hotel-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search room, guest, or reservation..."
              className="w-64 pl-9 pr-4 py-1.5 rounded-lg bg-slate-900/60 border border-white/10 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-400/50 transition-all"
            />
          </form>
        )}
      </div>

      {/* Action Buttons & Profile */}
      <div className="flex items-center gap-3">
        {['General Manager', 'Finance'].includes(userRole) && (
          <button
            onClick={onRunNightAudit}
            className="btn-secondary text-xs px-3 py-1.5 hidden sm:flex items-center gap-1.5"
            title="Run the idempotent daily financial audit"
          >
            <Moon className="w-3.5 h-3.5 text-indigo-400" />
            <span>Night Audit</span>
          </button>
        )}

        {['General Manager', 'Front Desk'].includes(userRole) && (
          <button
            onClick={onOpenNewBooking}
            className="btn-primary text-xs px-2.5 sm:px-3.5 py-1.5"
            aria-label="Create new reservation"
          >
            <Calendar className="w-4 h-4" />
            <span className="hidden sm:inline">New Reservation</span>
          </button>
        )}

        {/* Live operational snapshot */}
        <div className="relative">
          <button 
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 rounded-lg bg-slate-900/60 hover:bg-slate-800 text-gray-300 relative border border-white/10"
            aria-label="Show operational snapshot"
            aria-expanded={showNotifications}
          >
            <Bell className="w-4 h-4" />
            {(metrics.arrivalsToday > 0 || metrics.dirtyRooms > 0) && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full ring-2 ring-slate-950" />
            )}
          </button>

          {showNotifications && (
            <div className="absolute top-full right-0 mt-2 w-80 glass-panel p-3 z-50 animate-slide-up shadow-2xl">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                <span className="text-xs font-bold text-gray-200">Operational Snapshot</span>
                <span className="text-[10px] text-emerald-300 bg-emerald-400/10 px-2 py-0.5 rounded-full font-semibold">Live API</span>
              </div>
              <div className="space-y-2">
                <div className="p-2 rounded bg-slate-900/80 border border-emerald-500/20 text-xs">
                  <div className="font-semibold text-emerald-400">{metrics.occupancyRate}% occupancy</div>
                  <p className="text-gray-400 text-[11px] mt-0.5">{metrics.inHouseGuests} guest(s) currently checked in.</p>
                </div>
                <div className="p-2 rounded bg-slate-900/80 border border-amber-500/20 text-xs">
                  <div className="font-semibold text-amber-400">{metrics.arrivalsToday} arrival(s) · {metrics.departuresToday} departure(s)</div>
                  <p className="text-gray-400 text-[11px] mt-0.5">{metrics.dirtyRooms} dirty room(s) currently need attention.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="flex items-center gap-2 pl-2 border-l border-white/10">
          <div className="w-8 h-8 rounded-lg bg-slate-800 border border-amber-400/30 flex items-center justify-center text-xs font-bold text-amber-300">
            {initials}
          </div>
          <div className="hidden xl:block text-left">
            <div className="text-xs font-semibold text-gray-200">{userName}</div>
            <div className="text-[10px] text-gray-400">Shift: {userRole}</div>
          </div>
          <button
            type="button"
            onClick={() => void onLogout()}
            className="p-2 rounded-lg text-gray-400 hover:text-rose-300 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/30 transition-colors"
            aria-label={`Sign out ${userName}`}
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
