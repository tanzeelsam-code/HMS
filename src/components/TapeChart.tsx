import React, { useMemo, useState } from 'react';
import { Room, Reservation } from '../types';
import { Filter, User, ShieldCheck } from 'lucide-react';

interface TapeChartProps {
  rooms: Room[];
  reservations: Reservation[];
  onSelectReservation: (res: Reservation) => void;
  onOpenNewBooking: (roomNumber?: string, date?: string) => void;
  canCreateReservation?: boolean;
  businessDate?: string;
}

export const TapeChart: React.FC<TapeChartProps> = ({
  rooms,
  reservations,
  onSelectReservation,
  onOpenNewBooking,
  canCreateReservation = true,
  businessDate,
}) => {
  const [selectedType, setSelectedType] = useState<string>('All');
  const [hoveredRoom, setHoveredRoom] = useState<string | null>(null);

  const dates = useMemo(() => {
    const today = businessDate ? new Date(`${businessDate}T12:00:00`) : new Date();
    today.setHours(0, 0, 0, 0);

    return Array.from({ length: 7 }, (_, offset) => {
      const currentDate = new Date(today);
      currentDate.setDate(today.getDate() + offset);

      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const dayOfMonth = String(currentDate.getDate()).padStart(2, '0');
      const isToday = offset === 0;
      const displayDate = currentDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });

      return {
        day: currentDate.toLocaleDateString('en-US', { weekday: 'short' }),
        date: `${year}-${month}-${dayOfMonth}`,
        label: isToday ? `${displayDate} (Today)` : displayDate,
        isToday
      };
    });
  }, [businessDate]);

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
              API-Backed Grid
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Visual room inventory timeline. Click any available cell to assign a guest reservation.
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

          {canCreateReservation && (
            <button
              onClick={() => onOpenNewBooking()}
              className="btn-primary text-xs"
            >
              + Quick Assign
            </button>
          )}
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
              const roomBookings = reservations.filter(
                reservation => reservation.roomNumber === room.number
                  && ['Confirmed', 'Checked-In'].includes(reservation.status)
              );

              return (
                <tr 
                  key={room.id} 
                  className={`hover:bg-white/[0.02] transition-colors ${
                    hoveredRoom === room.number ? 'bg-amber-500/10' : ''
                  }`}
                  onMouseEnter={() => setHoveredRoom(room.number)}
                  onMouseLeave={() => setHoveredRoom(null)}
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
                        {typeof room.currentPrice === 'number' ? (
                          <>
                            <div className="text-xs font-bold text-amber-300">${room.currentPrice}</div>
                            <div className="text-[10px] text-gray-500">/night</div>
                          </>
                        ) : (
                          <div className="text-[10px] font-semibold text-gray-500">Rate restricted</div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* 7 Days Timeline Cells */}
                  {dates.map((d) => {
                    const bookingsForDate = roomBookings.filter(
                      reservation => d.date >= reservation.checkIn && d.date < reservation.checkOut
                    );

                    return (
                      <td 
                        key={d.date}
                        className={`p-1.5 border-r border-white/5 align-middle relative h-16 ${
                          d.isToday ? 'bg-amber-500/[0.03]' : ''
                        }`}
                      >
                        {bookingsForDate.length > 0 ? (
                          <div className="flex min-h-full flex-col gap-1">
                            {bookingsForDate.map((booking) => (
                              <button
                                key={booking.id}
                                type="button"
                                onClick={() => onSelectReservation(booking)}
                                aria-label={`Open reservation ${booking.code} for ${booking.guestName}`}
                                className={`w-full min-h-[3.25rem] rounded-lg p-2 flex flex-col justify-between text-left cursor-pointer transition-all hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 shadow-md border ${
                                  booking.status === 'Checked-In'
                                    ? 'bg-gradient-to-r from-emerald-950/80 to-emerald-900/60 border-emerald-500/40 text-emerald-200'
                                    : 'bg-gradient-to-r from-amber-950/80 to-amber-900/60 border-amber-500/40 text-amber-200'
                                }`}
                              >
                                <span className="flex w-full items-center justify-between">
                                  <span className="font-bold text-xs truncate flex items-center gap-1">
                                    <User className="w-3 h-3 flex-shrink-0" />
                                    {booking.guestName}
                                  </span>
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/40 font-mono">
                                    {booking.channel}
                                  </span>
                                </span>

                                <span className="flex w-full items-center justify-between text-[10px] opacity-80">
                                  <span>Code: {booking.code}</span>
                                  {booking.contactlessCheckInCompleted && (
                                    <span className="text-cyan-300 font-bold flex items-center gap-0.5" title="Contactless Digital Key Active">
                                      <ShieldCheck className="w-3 h-3" /> Key
                                    </span>
                                  )}
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : canCreateReservation && room.status !== 'Out of Service' ? (
                          // Empty Cell -> Click to book
                          <button
                            type="button"
                            onClick={() => onOpenNewBooking(room.number, d.date)}
                            aria-label={`Book room ${room.number} for ${d.label}`}
                            className="w-full h-full min-h-[3.25rem] rounded-lg border border-dashed border-white/5 hover:border-amber-400/40 hover:bg-amber-400/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 transition-all flex items-center justify-center text-[10px] text-gray-500 hover:text-amber-300 group"
                          >
                            <span className="opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 font-bold transition-opacity">
                              + Book #{room.number}
                            </span>
                          </button>
                        ) : (
                          <div className="w-full h-full min-h-[3.25rem] rounded-lg border border-white/5 flex items-center justify-center text-[10px] text-gray-600">
                            {room.status === 'Out of Service' ? 'Unavailable' : 'No booking'}
                          </div>
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
