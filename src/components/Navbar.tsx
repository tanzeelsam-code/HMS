import React, { useState } from 'react';
import {
  Bell,
  Building2,
  CalendarPlus,
  ChevronDown,
  Flame,
  KeyRound,
  LogOut,
  Moon,
  Search,
} from 'lucide-react';
import { HotelMetrics } from '../types';
import { BrandMark } from './BrandMark';

interface NavbarProps {
  metrics: HotelMetrics;
  onOpenNewBooking: () => void;
  onRunNightAudit: () => void;
  onSearch: (query: string) => void;
  selectedProperty: string;
  onLogout: () => void | Promise<void>;
  onChangePassword: () => void;
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
  onChangePassword,
  userName = 'General Manager',
  userRole = 'Front Desk Admin',
}) => {
  const initials = userName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'GM';
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const canSearch = ['General Manager', 'Front Desk', 'Finance'].includes(userRole);

  return (
    <header className="sticky top-0 z-40 flex h-[76px] w-full items-center gap-3 border-b border-slate-200 bg-white/95 px-4 shadow-sm backdrop-blur-xl sm:px-5 lg:gap-5 lg:px-6">
      <div className="flex shrink-0 items-center gap-3.5" aria-label="Nexus HOS hotel operating system">
        <BrandMark className="h-[52px] w-[52px] drop-shadow-[0_4px_16px_rgba(217,119,6,0.2)]" />
        <div className="hidden sm:block">
          <div className="text-[22px] font-black tracking-[-0.03em] text-slate-900 leading-none">
            Nexus <span className="text-amber-600">HOS</span>
          </div>
          <p className="mt-1 text-[11.5px] font-bold uppercase tracking-[0.2em] text-slate-500 leading-none">
            Hotel operating system
          </p>
        </div>
      </div>

      <div className="hidden h-8 w-px shrink-0 bg-slate-200 sm:block" />

      <button
        type="button"
        className="hidden shrink-0 items-center gap-3 rounded-xl border border-slate-200 bg-slate-100/70 px-3.5 py-2 text-left transition-colors hover:border-slate-300 hover:bg-slate-200/60 2xl:flex"
        title={selectedProperty}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
          <Building2 className="h-4 w-4" />
        </span>
        <span>
          <span className="block text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">Property</span>
          <span className="mt-0.5 block whitespace-nowrap text-xs font-semibold text-slate-800">{selectedProperty}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
        {canSearch && (
          <form
            className="relative hidden w-full max-w-[440px] lg:block"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              if (searchQuery.trim()) onSearch(searchQuery.trim());
            }}
          >
            <label htmlFor="global-hotel-search" className="sr-only">
              Search guests, rooms, or reservation codes
            </label>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="global-hotel-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search guests, rooms or reservations"
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-100/80 pl-10 pr-4 text-xs text-slate-900 shadow-inner placeholder:text-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/10"
            />
          </form>
        )}

        <div className="hidden shrink-0 items-center gap-3 rounded-xl border border-slate-200 bg-slate-100/70 px-3.5 py-2 2xl:flex">
          <Flame className="h-4 w-4 text-amber-600" />
          <div className="min-w-[126px]">
            <div className="flex items-center justify-between gap-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              <span>Occupancy</span>
              <span className="text-emerald-600 font-bold">{metrics.occupancyRate}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
                style={{ width: `${metrics.occupancyRate}%` }}
              />
            </div>
          </div>
        </div>

        <div className="hidden items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50/90 px-3 py-1 text-[11px] font-extrabold text-amber-800 shadow-xs sm:flex">
          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          Presentation Mode
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {['General Manager', 'Finance'].includes(userRole) && (
          <button
            type="button"
            onClick={onRunNightAudit}
            className="hidden h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-xs transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 xl:flex"
            title="Run the idempotent daily financial audit"
          >
            <Moon className="h-4 w-4 text-indigo-600" />
            Night audit
          </button>
        )}

        {['General Manager', 'Front Desk'].includes(userRole) && (
          <button
            type="button"
            onClick={onOpenNewBooking}
            className="flex h-10 items-center gap-2 rounded-xl bg-amber-600 px-3 text-xs font-bold text-white shadow-md transition-colors hover:bg-amber-700 sm:px-4"
            aria-label="Create new reservation"
          >
            <CalendarPlus className="h-4 w-4" />
            <span className="hidden md:inline">New reservation</span>
          </button>
        )}

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowNotifications((isOpen) => !isOpen)}
            className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-xs transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            aria-label="Show operational snapshot"
            aria-expanded={showNotifications}
          >
            <Bell className="h-[18px] w-[18px]" />
            {(metrics.arrivalsToday > 0 || metrics.dirtyRooms > 0) && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white" />
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-full z-50 mt-3 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-xl animate-slide-up">
              <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Today at a glance</h2>
                  <p className="mt-1 text-[11px] text-slate-500">Live property operations</p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Live
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 py-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">In house</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{metrics.inHouseGuests}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">registered guests</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Occupancy</p>
                  <p className="mt-1 text-xl font-bold text-emerald-600">{metrics.occupancyRate}%</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">current inventory</p>
                </div>
              </div>
              <div className="space-y-2 border-t border-slate-100 pt-3 text-xs">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Arrivals / departures</span>
                  <span className="font-bold text-slate-900">{metrics.arrivalsToday} / {metrics.departuresToday}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Rooms awaiting service</span>
                  <span className={metrics.dirtyRooms > 0 ? 'font-bold text-amber-600' : 'font-bold text-emerald-600'}>
                    {metrics.dirtyRooms}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="ml-1 flex items-center gap-2.5 border-l border-slate-200 pl-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-300 bg-amber-100 text-[11px] font-bold text-amber-800">
            {initials}
          </div>
          <div className="hidden min-w-0 2xl:block">
            <div className="whitespace-nowrap text-xs font-bold text-slate-900">{userName}</div>
            <div className="mt-0.5 whitespace-nowrap text-[10px] font-medium text-slate-500">{userRole}</div>
          </div>
          <button
            type="button"
            onClick={onChangePassword}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label={`Change password for ${userName}`}
            title="Change password"
          >
            <KeyRound className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void onLogout()}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
            aria-label={`Sign out ${userName}`}
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
