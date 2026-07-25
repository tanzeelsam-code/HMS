import React, { useState } from 'react';
import { GroupBooking } from '../types';
import { Building, Users, Plus } from 'lucide-react';

const DAY_MS = 24 * 60 * 60 * 1000;
const dateFromNow = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
const addDays = (value: string, days: number) => new Date(
  Date.parse(`${value}T00:00:00.000Z`) + days * DAY_MS,
).toISOString().slice(0, 10);

interface GroupBookingBoardProps {
  groups: GroupBooking[];
  onAddGroup: (grp: GroupBooking) => boolean | Promise<boolean>;
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
  const [startDate, setStartDate] = useState(dateFromNow(30));
  const [endDate, setEndDate] = useState(dateFromNow(33));
  const [releaseDate, setReleaseDate] = useState(dateFromNow(16));
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName || !companyName) return;

    const rooms = parseInt(roomsAllocated) || 10;
    const rate = parseFloat(groupRate) || 280;
    const catering = parseFloat(cateringTotal) || 5000;
    const nights = Math.max(1, Math.round(
      (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) / DAY_MS,
    ));
    const totalVal = (rooms * rate * nights) + catering;

    const newGroup: GroupBooking = {
      id: `grp-${Date.now()}`,
      groupName,
      companyName,
      contactPerson,
      contactEmail,
      roomsAllocated: rooms,
      roomsPickedUp: 0,
      startDate,
      endDate,
      releaseDate,
      status: 'Tentative Hold',
      groupRate: rate,
      banquetCateringTotal: catering,
      totalValue: totalVal
    };

    setSubmitting(true);
    try {
      const saved = await onAddGroup(newGroup);
      if (saved) {
        setGroupName('');
        setCompanyName('');
        setContactPerson('');
        setContactEmail('');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 surface-panel bg-white p-5 border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Groups & Events / MICE Manager</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300">
              Corporate Blocks & Banquet Billing
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1 font-medium">
            Manage corporate room blocks, release dates, pick-up wash tracking, and event catering packages.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* New Group Block Form */}
        <div className="lg:col-span-5 surface-panel bg-white p-5 space-y-4 border border-slate-200 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Building className="w-4 h-4 text-amber-600" /> Create Corporate Group Room Block
          </h3>

          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Group / Event Name</label>
              <input
                type="text"
                placeholder="e.g. AI Leadership Summit 2026"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="field-control text-xs"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Company / Organization</label>
                <input
                  type="text"
                  placeholder="Apex Corp"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="field-control text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Contact Person</label>
                <input
                  type="text"
                  placeholder="Jane Smith"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  className="field-control text-xs"
                />
              </div>
            </div>

            <div>
              <label htmlFor="group-contact-email" className="block text-slate-700 font-bold mb-1">Contact Email</label>
              <input
                id="group-contact-email"
                type="email"
                placeholder="events@example.com"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                className="field-control text-xs"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Rooms</label>
                <input
                  type="number"
                  value={roomsAllocated}
                  onChange={(e) => setRoomsAllocated(e.target.value)}
                  className="field-control text-xs text-amber-800 font-bold font-mono text-center"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-bold mb-1">Rate ($/n)</label>
                <input
                  type="number"
                  value={groupRate}
                  onChange={(e) => setGroupRate(e.target.value)}
                  className="field-control text-xs text-amber-800 font-bold font-mono text-center"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-bold mb-1">Catering ($)</label>
                <input
                  type="number"
                  value={cateringTotal}
                  onChange={(e) => setCateringTotal(e.target.value)}
                  className="field-control text-xs text-amber-800 font-bold font-mono text-center"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label htmlFor="group-start-date" className="block text-slate-700 font-bold mb-1">Arrival</label>
                <input
                  id="group-start-date"
                  type="date"
                  min={dateFromNow(0)}
                  value={startDate}
                  onChange={(event) => {
                    const nextStart = event.target.value;
                    setStartDate(nextStart);
                    if (endDate <= nextStart) setEndDate(addDays(nextStart, 1));
                    if (releaseDate > nextStart) setReleaseDate(nextStart);
                  }}
                  className="field-control text-xs"
                  required
                />
              </div>
              <div>
                <label htmlFor="group-end-date" className="block text-slate-700 font-bold mb-1">Departure</label>
                <input
                  id="group-end-date"
                  type="date"
                  min={addDays(startDate, 1)}
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="field-control text-xs"
                  required
                />
              </div>
              <div>
                <label htmlFor="group-release-date" className="block text-slate-700 font-bold mb-1">Release date</label>
                <input
                  id="group-release-date"
                  type="date"
                  max={startDate}
                  value={releaseDate}
                  onChange={(event) => setReleaseDate(event.target.value)}
                  className="field-control text-xs"
                  required
                />
              </div>
            </div>

            <button type="submit" disabled={submitting} className="btn-primary text-xs w-full py-2.5 justify-center disabled:opacity-60">
              <Plus className="w-4 h-4" /> {submitting ? 'Creating Contract…' : 'Create Group Contract'}
            </button>
          </form>
        </div>

        {/* Group Contracts List */}
        <div className="lg:col-span-7 surface-panel bg-white p-5 space-y-4 border border-slate-200 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-600" /> Active Corporate Room Blocks
          </h3>

          <div className="space-y-3">
            {groups.map((g) => {
              const pickupPct = Math.round((g.roomsPickedUp / g.roomsAllocated) * 100);

              return (
                <div 
                  key={g.id}
                  className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 hover:border-amber-300 transition-all text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-extrabold text-sm text-slate-900">{g.groupName}</div>
                      <div className="text-[11px] text-slate-600 font-medium mt-0.5">
                        {g.companyName} • Contact: {g.contactPerson || 'Unassigned'}{g.contactEmail ? ` · ${g.contactEmail}` : ''}
                      </div>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] border ${
                      g.status === 'Definite Block' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}>
                      {g.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 text-center">
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <div className="text-[10px] text-slate-500 font-bold uppercase">Block Pickup</div>
                      <div className="font-bold text-slate-900 mt-0.5">{g.roomsPickedUp} / {g.roomsAllocated} ({pickupPct}%)</div>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <div className="text-[10px] text-slate-500 font-bold uppercase">Banquet & F&B</div>
                      <div className="font-bold text-emerald-700 mt-0.5">${g.banquetCateringTotal.toLocaleString()}</div>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <div className="text-[10px] text-slate-500 font-bold uppercase">Contract Total</div>
                      <div className="font-bold text-amber-800 font-mono mt-0.5">${g.totalValue.toLocaleString()}</div>
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
