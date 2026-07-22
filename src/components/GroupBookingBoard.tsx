import React, { useState } from 'react';
import { GroupBooking } from '../types';
import { Building, Users, Calendar, DollarSign, Plus, CheckCircle2, AlertCircle } from 'lucide-react';

interface GroupBookingBoardProps {
  groups: GroupBooking[];
  onAddGroup: (grp: GroupBooking) => void;
}

export const GroupBookingBoard: React.FC<GroupBookingBoardProps> = ({
  groups,
  onAddGroup
}) => {
  const [groupName, setGroupName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [roomsAllocated, setRoomsAllocated] = useState('10');
  const [groupRate, setGroupRate] = useState('280');
  const [cateringTotal, setCateringTotal] = useState('5000');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName || !companyName) return;

    const rooms = parseInt(roomsAllocated) || 10;
    const rate = parseFloat(groupRate) || 280;
    const catering = parseFloat(cateringTotal) || 5000;
    const totalVal = (rooms * rate * 3) + catering;

    const newGroup: GroupBooking = {
      id: `grp-${Date.now()}`,
      groupName,
      companyName,
      contactPerson,
      contactEmail,
      roomsAllocated: rooms,
      roomsPickedUp: 0,
      startDate: '2026-08-15',
      endDate: '2026-08-18',
      status: 'Tentative Hold',
      groupRate: rate,
      banquetCateringTotal: catering,
      totalValue: totalVal
    };

    onAddGroup(newGroup);
    setGroupName('');
    setCompanyName('');
  };

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-100 tracking-tight">Groups & Events / MICE Manager</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-400/30">
              Corporate Blocks & Banquet Billing
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Manage corporate room blocks, release dates, pick-up wash tracking, and event catering packages.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* New Group Block Form */}
        <div className="lg:col-span-5 glass-panel p-5 space-y-4">
          <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
            <Building className="w-4 h-4 text-amber-400" /> Create Corporate Group Room Block
          </h3>

          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="block text-gray-400 font-semibold mb-1">Group / Event Name</label>
              <input
                type="text"
                placeholder="e.g. AI Leadership Summit 2026"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-gray-200 focus:outline-none focus:border-amber-400/50"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-400 font-semibold mb-1">Company / Organization</label>
                <input
                  type="text"
                  placeholder="Apex Corp"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-gray-200"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-400 font-semibold mb-1">Contact Person</label>
                <input
                  type="text"
                  placeholder="Jane Smith"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-gray-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-gray-400 font-semibold mb-1">Rooms</label>
                <input
                  type="number"
                  value={roomsAllocated}
                  onChange={(e) => setRoomsAllocated(e.target.value)}
                  className="w-full p-2 rounded-lg bg-slate-900 border border-white/10 text-amber-300 font-bold font-mono text-center"
                />
              </div>
              <div>
                <label className="block text-gray-400 font-semibold mb-1">Rate ($/n)</label>
                <input
                  type="number"
                  value={groupRate}
                  onChange={(e) => setGroupRate(e.target.value)}
                  className="w-full p-2 rounded-lg bg-slate-900 border border-white/10 text-amber-300 font-bold font-mono text-center"
                />
              </div>
              <div>
                <label className="block text-gray-400 font-semibold mb-1">Catering ($)</label>
                <input
                  type="number"
                  value={cateringTotal}
                  onChange={(e) => setCateringTotal(e.target.value)}
                  className="w-full p-2 rounded-lg bg-slate-900 border border-white/10 text-amber-300 font-bold font-mono text-center"
                />
              </div>
            </div>

            <button type="submit" className="btn-primary text-xs w-full py-2.5 justify-center">
              <Plus className="w-4 h-4" /> Create Group Contract
            </button>
          </form>
        </div>

        {/* Group Contracts List */}
        <div className="lg:col-span-7 glass-panel p-5 space-y-4">
          <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-400" /> Active Corporate Room Blocks
          </h3>

          <div className="space-y-3">
            {groups.map((g) => {
              const pickupPct = Math.round((g.roomsPickedUp / g.roomsAllocated) * 100);

              return (
                <div 
                  key={g.id}
                  className="p-4 rounded-xl bg-slate-900/80 border border-white/10 space-y-3 hover:border-amber-400/40 transition-all text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-extrabold text-sm text-gray-100">{g.groupName}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">{g.companyName} • Contact: {g.contactPerson}</div>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] border ${
                      g.status === 'Definite Block' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    }`}>
                      {g.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10 text-center">
                    <div className="bg-slate-950 p-2 rounded-lg">
                      <div className="text-[10px] text-gray-400">Block Pickup</div>
                      <div className="font-bold text-gray-200 mt-0.5">{g.roomsPickedUp} / {g.roomsAllocated} ({pickupPct}%)</div>
                    </div>
                    <div className="bg-slate-950 p-2 rounded-lg">
                      <div className="text-[10px] text-gray-400">Banquet & F&B</div>
                      <div className="font-bold text-emerald-400 mt-0.5">${g.banquetCateringTotal.toLocaleString()}</div>
                    </div>
                    <div className="bg-slate-950 p-2 rounded-lg">
                      <div className="text-[10px] text-gray-400">Contract Total</div>
                      <div className="font-bold text-amber-300 font-mono mt-0.5">${g.totalValue.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
