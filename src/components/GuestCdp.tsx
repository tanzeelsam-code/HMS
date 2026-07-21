import React, { useState } from 'react';
import { GuestProfile } from '../types';
import { Users, Award, Heart, DollarSign, Calendar, Mail, Phone, Search, ShieldCheck } from 'lucide-react';

interface GuestCdpProps {
  profiles: GuestProfile[];
}

export const GuestCdp: React.FC<GuestCdpProps> = ({ profiles }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<GuestProfile>(profiles[0]);

  const filtered = profiles.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getVipBadge = (tier: string) => {
    switch (tier) {
      case 'Platinum': return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      case 'Gold': return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      default: return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
    }
  };

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-100 tracking-tight">Unified Guest Profile & Mini-CDP</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
              Golden Identity Resolution
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Deduplicated guest data aggregating lifetime stay history, total spend, POS preferences, and VIP notes.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Guest Search & List */}
        <div className="lg:col-span-4 glass-panel p-4 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search guest profiles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-xs text-gray-200 focus:outline-none focus:border-amber-400/50"
            />
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedProfile(p)}
                className={`w-full text-left p-3 rounded-xl border text-xs transition-all flex items-center justify-between ${
                  selectedProfile.id === p.id 
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-200' 
                    : 'bg-slate-900/60 border-white/5 text-gray-300 hover:bg-white/5'
                }`}
              >
                <div>
                  <div className="font-bold text-gray-100">{p.name}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">{p.email}</div>
                </div>
                <div className="text-right">
                  <div className="font-extrabold text-amber-300">${p.lifetimeSpend.toLocaleString()}</div>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${getVipBadge(p.vipTier)}`}>
                    {p.vipTier}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right Column: Detailed Golden Profile View */}
        <div className="lg:col-span-8 glass-panel p-6 space-y-6">
          <div className="flex items-start justify-between border-b border-white/10 pb-4">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-extrabold text-gray-100">{selectedProfile.name}</h3>
                <span className={`text-xs px-2.5 py-0.5 rounded-full border font-bold ${getVipBadge(selectedProfile.vipTier)}`}>
                  {selectedProfile.vipTier} VIP Tier
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-400 mt-1">
                <span>{selectedProfile.email}</span>
                <span>• {selectedProfile.phone}</span>
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs text-gray-400">Total Lifetime Spend</div>
              <div className="text-2xl font-extrabold text-amber-300 font-mono">
                ${selectedProfile.lifetimeSpend.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-900 border border-white/10">
              <div className="text-gray-400">Total Completed Stays</div>
              <div className="text-lg font-bold text-gray-200 mt-1">{selectedProfile.totalStays} Stays ({selectedProfile.totalNights} Nights)</div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900 border border-white/10">
              <div className="text-gray-400">Preferred Suite Category</div>
              <div className="text-sm font-bold text-amber-300 mt-1">{selectedProfile.preferredRoomType}</div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900 border border-white/10">
              <div className="text-gray-400">Last Stayed</div>
              <div className="text-sm font-bold text-emerald-400 mt-1">{selectedProfile.lastStayDate}</div>
            </div>
          </div>

          {/* Preferences & Loyalty Notes */}
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-900/80 border border-white/10 space-y-2">
              <div className="font-bold text-gray-200 flex items-center gap-2">
                <Heart className="w-4 h-4 text-rose-400" /> Dietary & Amenity Preferences
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {selectedProfile.dietaryPreferences.map((pref, i) => (
                  <span key={i} className="px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/30 text-[11px] font-semibold">
                    {pref}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-white/10 space-y-1.5">
              <div className="font-bold text-gray-200">Staff Loyalty & Operations Notes</div>
              <p className="text-gray-300 text-xs leading-relaxed">{selectedProfile.notes}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
