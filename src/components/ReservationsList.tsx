import React, { useState } from 'react';
import { Reservation, BookingStatus } from '../types';
import { 
  Users, Search, Filter, Calendar, CheckCircle2, LogOut, 
  Receipt, ShieldCheck, Plus, ArrowUpRight, Phone, Mail, Award 
} from 'lucide-react';

interface ReservationsListProps {
  reservations: Reservation[];
  onSelectReservation: (res: Reservation) => void;
  onCheckIn: (resId: string) => void;
  onCheckOut: (resId: string) => void;
  onOpenNewBooking: () => void;
}

export const ReservationsList: React.FC<ReservationsListProps> = ({
  reservations,
  onSelectReservation,
  onCheckIn,
  onCheckOut,
  onOpenNewBooking
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [channelFilter, setChannelFilter] = useState<string>('All');

  const filteredReservations = reservations.filter(res => {
    const matchesSearch = 
      res.guestName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      res.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      res.roomNumber.includes(searchTerm) ||
      res.guestEmail.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'All' || res.status === statusFilter;
    const matchesChannel = channelFilter === 'All' || res.channel === channelFilter;

    return matchesSearch && matchesStatus && matchesChannel;
  });

  const getVipBadge = (tier: string) => {
    switch (tier) {
      case 'Platinum': return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      case 'Gold': return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'Silver': return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      default: return 'bg-gray-800 text-gray-400 border-gray-700';
    }
  };

  const getStatusBadge = (status: BookingStatus) => {
    switch (status) {
      case 'Checked-In': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'Confirmed': return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'Checked-Out': return 'bg-slate-700 text-slate-300 border-slate-600';
      case 'Cancelled': return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      default: return 'bg-gray-800 text-gray-400';
    }
  };

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-5">
        <div>
          <h2 className="text-xl font-bold text-gray-100 tracking-tight">Reservations & Guest Directory</h2>
          <p className="text-xs text-gray-400 mt-1">
            Manage incoming arrivals, in-house guests, folio ledgers, and check-in workflows.
          </p>
        </div>

        <button 
          onClick={onOpenNewBooking}
          className="btn-primary text-xs self-start md:self-auto"
        >
          <Plus className="w-4 h-4" /> New Booking
        </button>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="glass-panel p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by Guest Name, Code (GH-XXXX), or Room #..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-900/80 border border-white/10 text-xs text-gray-200 focus:outline-none focus:border-amber-400/50"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-2 rounded-lg border border-white/10 text-xs">
            <Filter className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-gray-400">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-gray-200 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="All" className="bg-slate-900">All Statuses</option>
              <option value="Checked-In" className="bg-slate-900">Checked-In</option>
              <option value="Confirmed" className="bg-slate-900">Confirmed Arrival</option>
              <option value="Checked-Out" className="bg-slate-900">Checked-Out</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-2 rounded-lg border border-white/10 text-xs">
            <span className="text-gray-400">Channel:</span>
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="bg-transparent text-gray-200 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="All" className="bg-slate-900">All OTA Channels</option>
              <option value="Direct Web" className="bg-slate-900">Direct Web</option>
              <option value="Booking.com" className="bg-slate-900">Booking.com</option>
              <option value="Airbnb" className="bg-slate-900">Airbnb</option>
              <option value="Expedia" className="bg-slate-900">Expedia</option>
            </select>
          </div>
        </div>
      </div>

      {/* Reservation Cards / Table Grid */}
      <div className="grid grid-cols-1 gap-3">
        {filteredReservations.map((res) => {
          const totalBalance = res.folioItems.reduce((acc, item) => acc + item.amount, 0);

          return (
            <div 
              key={res.id}
              className="glass-panel p-4 hover:border-amber-400/40 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
              {/* Guest & Room Info */}
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-slate-800 border border-white/10 flex flex-col items-center justify-center flex-shrink-0">
                  <span className="text-[10px] text-gray-400 font-semibold uppercase">Room</span>
                  <span className="font-extrabold text-base text-amber-300 font-mono">#{res.roomNumber}</span>
                </div>

                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="font-extrabold text-sm text-gray-100">{res.guestName}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${getVipBadge(res.vipTier)} flex items-center gap-1`}>
                      <Award className="w-3 h-3" /> {res.vipTier} VIP
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${getStatusBadge(res.status)}`}>
                      {res.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-400 mt-1 flex-wrap">
                    <span className="font-mono text-gray-300 font-semibold">{res.code}</span>
                    <span>• {res.roomType}</span>
                    <span>• {res.nights} Nights ({res.checkIn} → {res.checkOut})</span>
                  </div>

                  <div className="flex items-center gap-4 text-[11px] text-gray-500 mt-1 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Mail className="w-3 h-3 text-gray-400" /> {res.guestEmail}
                    </span>
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3 text-gray-400" /> {res.guestPhone}
                    </span>
                    <span className="text-amber-400/90 font-medium">Channel: {res.channel}</span>
                  </div>
                </div>
              </div>

              {/* Financial Balance & Action Buttons */}
              <div className="flex items-center justify-between lg:justify-end gap-6 pt-3 lg:pt-0 border-t lg:border-t-0 border-white/10">
                {/* Folio Balance summary */}
                <div className="text-left lg:text-right">
                  <div className="text-[11px] text-gray-400 font-medium">Folio Total</div>
                  <div className="text-sm font-bold text-gray-200">${res.totalAmount}</div>
                  <div className={`text-[10px] font-semibold ${totalBalance > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {totalBalance > 0 ? `Unpaid Balance: $${totalBalance}` : '✓ Fully Paid'}
                  </div>
                </div>

                {/* Workflow Buttons */}
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => onSelectReservation(res)}
                    className="btn-secondary text-xs px-3 py-1.5"
                    title="View & Edit Folio Charges"
                  >
                    <Receipt className="w-3.5 h-3.5 text-amber-400" />
                    <span>Folio</span>
                  </button>

                  {res.status === 'Confirmed' && (
                    <button 
                      onClick={() => onCheckIn(res.id)}
                      className="btn-primary text-xs px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-emerald-500/20"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Check In</span>
                    </button>
                  )}

                  {res.status === 'Checked-In' && (
                    <button 
                      onClick={() => onCheckOut(res.id)}
                      className="btn-secondary text-xs px-3 py-1.5 border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
                    >
                      <LogOut className="w-3.5 h-3.5 text-rose-400" />
                      <span>Check Out</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
