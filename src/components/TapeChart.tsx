import React, { useState } from 'react';
import { Room, Reservation, RoomType } from '../types';
import { Calendar, Filter, User, Sparkles, AlertCircle, ArrowRight, ShieldCheck, Check, Clock } from 'lucide-react';

interface TapeChartProps {
  rooms: Room[];
  reservations: Reservation[];
  onSelectReservation: (res: Reservation) => void;
  onOpenNewBooking: (roomNumber?: string) => void;
}

export const TapeChart: React.FC<TapeChartProps> = ({
  rooms,
  reservations,
  onSelectReservation,
  onOpenNewBooking
}) => {
  const [selectedType, setSelectedType] = useState<string>('All');
  const [dragHoverRoom, setDragHoverRoom] = useState<string | null>(null);

  // Generate 7-day window starting July 20, 2026
  const dates = [
    { day: 'Mon', date: '2026-07-20', label: 'Jul 20' },
    { day: 'Tue', date: '2026-07-21', label: 'Jul 21 (Today)', isToday: true },
    { day: 'Wed', date: '2026-07-22', label: 'Jul 22' },
    { day: 'Thu', date: '2026-07-23', label: 'Jul 23' },
    { day: 'Fri', date: '2026-07-24', label: 'Jul 24' },
    { day: 'Sat', date: '2026-07-25', label: 'Jul 25' },
    { day: 'Sun', date: '2026-07-26', label: 'Jul 26' },
  ];

  const filteredRooms = rooms.filter(room => 
    selectedType === 'All' || room.type === selectedType
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Occupied': return 'badge-occupied';
      case 'Vacant Clean': return 'badge-vacant';
      case 'Reserved': return 'badge-reserved';
      case 'Vacant Dirty': return 'badge-dirty';
      case 'Out of Service': return 'badge-maintenance';
      default: return 'bg-gray-800 text-gray-300';
    }
  };

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-gray-100 tracking-tight">Front Desk Tape Chart</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Live Real-Time Grid
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Visual room inventory timeline. Drag or click any cell to assign guest reservations.
          </p>
        </div>

        {/* Filters & Legend */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-white/10 text-xs">
            <Filter className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-gray-400">Category:</span>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="bg-transparent text-gray-200 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="All" className="bg-slate-900">All Room Categories</option>
              <option value="Standard King" className="bg-slate-900">Standard King</option>
              <option value="Deluxe Ocean View" className="bg-slate-900">Deluxe Ocean View</option>
              <option value="Executive Suite" className="bg-slate-900">Executive Suite</option>
              <option value="Presidential Suite" className="bg-slate-900">Presidential Suite</option>
            </select>
          </div>

          <button 
            onClick={() => onOpenNewBooking()}
            className="btn-primary text-xs"
          >
            + Quick Assign
          </button>
        </div>
      </div>

      {/* Grid Legend Bar */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-2 rounded-xl bg-slate-900/50 border border-white/5 text-xs text-gray-400">
        <span className="font-bold text-gray-300">Legend:</span>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-emerald-500/30 border border-emerald-500" />
          <span>Occupied</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-amber-500/30 border border-amber-500" />
          <span>Confirmed Booking</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-blue-500/30 border border-blue-500" />
          <span>Vacant Clean</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-rose-500/30 border border-rose-500" />
          <span>Housekeeping Required</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-purple-500/30 border border-purple-500" />
          <span>Out of Service (OOO)</span>
        </div>
      </div>

      {/* Main Timeline Grid Table */}
      <div className="glass-panel overflow-x-auto p-0 border border-white/10 rounded-xl shadow-2xl">
        <table className="w-full min-w-[900px] border-collapse text-left text-xs">
          <thead>
            <tr className="bg-slate-900/90 border-b border-white/10 text-gray-300">
              <th className="p-4 font-bold w-48 sticky left-0 z-20 bg-slate-900 border-r border-white/10 shadow-md">
                Room & Category
              </th>
              {dates.map((d) => (
                <th 
                  key={d.date} 
                  className={`p-3 text-center font-semibold border-r border-white/5 min-w-[120px] ${
                    d.isToday ? 'bg-amber-500/10 text-amber-300 border-b-2 border-b-amber-400' : ''
                  }`}
                >
                  <div className="text-[11px] text-gray-400 font-normal">{d.day}</div>
                  <div className="text-xs font-bold">{d.label}</div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-white/5">
            {filteredRooms.map((room) => {
              // Find matching reservation for this room
              const roomBooking = reservations.find(r => r.roomNumber === room.number && r.status !== 'Cancelled');

              return (
                <tr 
                  key={room.id} 
                  className={`hover:bg-white/[0.02] transition-colors ${
                    dragHoverRoom === room.number ? 'bg-amber-500/10' : ''
                  }`}
                  onMouseEnter={() => setDragHoverRoom(room.number)}
                  onMouseLeave={() => setDragHoverRoom(null)}
                >
                  {/* Sticky Left Room Cell */}
                  <td className="p-3.5 sticky left-0 z-10 bg-slate-900/95 border-r border-white/10 shadow-md">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-gray-100 font-mono">#{room.number}</span>
                          <span className={`badge ${getStatusBadge(room.status)} text-[10px]`}>
                            {room.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[130px]">
                          {room.type}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-amber-300">${room.currentPrice}</div>
                        <div className="text-[10px] text-gray-500">/night</div>
                      </div>
                    </div>
                  </td>

                  {/* 7 Days Timeline Cells */}
                  {dates.map((d) => {
                    // Check if this date falls within roomBooking checkIn and checkOut
                    const isBookedCell = roomBooking && 
                      d.date >= roomBooking.checkIn && 
                      d.date < roomBooking.checkOut;

                    const isCheckInDay = roomBooking && d.date === roomBooking.checkIn;

                    return (
                      <td 
                        key={d.date}
                        className={`p-1.5 border-r border-white/5 align-middle relative h-16 ${
                          d.isToday ? 'bg-amber-500/[0.03]' : ''
                        }`}
                      >
                        {isBookedCell ? (
                          <div
                            onClick={() => onSelectReservation(roomBooking)}
                            className={`w-full h-full rounded-lg p-2 flex flex-col justify-between cursor-pointer transition-all hover:scale-[1.02] shadow-md border ${
                              roomBooking.status === 'Checked-In'
                                ? 'bg-gradient-to-r from-emerald-950/80 to-emerald-900/60 border-emerald-500/40 text-emerald-200'
                                : 'bg-gradient-to-r from-amber-950/80 to-amber-900/60 border-amber-500/40 text-amber-200'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-xs truncate flex items-center gap-1">
                                <User className="w-3 h-3 flex-shrink-0" />
                                {roomBooking.guestName}
                              </span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/40 font-mono">
                                {roomBooking.channel}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-[10px] opacity-80">
                              <span>Code: {roomBooking.code}</span>
                              {roomBooking.contactlessCheckInCompleted && (
                                <span className="text-cyan-300 font-bold flex items-center gap-0.5" title="Contactless Digital Key Active">
                                  <ShieldCheck className="w-3 h-3" /> Key
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          // Empty Cell -> Click to book
                          <button
                            onClick={() => onOpenNewBooking(room.number)}
                            className="w-full h-full rounded-lg border border-dashed border-white/5 hover:border-amber-400/40 hover:bg-amber-400/5 transition-all flex items-center justify-center text-[10px] text-gray-500 hover:text-amber-300 group"
                          >
                            <span className="opacity-0 group-hover:opacity-100 font-bold transition-opacity">
                              + Book #{room.number}
                            </span>
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
