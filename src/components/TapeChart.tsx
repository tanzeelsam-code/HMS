import React, { useMemo, useState } from 'react';
import { Room, Reservation } from '../types';
import {
  BedDouble,
  CalendarDays,
  Filter,
  Plus,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react';

interface TapeChartProps {
  rooms: Room[];
  reservations: Reservation[];
  onSelectReservation: (res: Reservation) => void;
  onOpenNewBooking: (roomNumber?: string, date?: string) => void;
  canCreateReservation?: boolean;
  businessDate?: string;
}

const roomStatusStyles: Record<Room['status'], string> = {
  Occupied: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
  'Vacant Clean': 'border-sky-400/20 bg-sky-400/10 text-sky-300',
  Reserved: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
  'Vacant Dirty': 'border-rose-400/20 bg-rose-400/10 text-rose-300',
  'Out of Service': 'border-violet-400/20 bg-violet-400/10 text-violet-300',
};

const legend = [
  { label: 'In house', dot: 'bg-emerald-400' },
  { label: 'Confirmed', dot: 'bg-amber-400' },
  { label: 'Ready', dot: 'bg-sky-400' },
  { label: 'Needs service', dot: 'bg-rose-400' },
  { label: 'Out of service', dot: 'bg-violet-400' },
];

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

      return {
        day: currentDate.toLocaleDateString('en-US', { weekday: 'short' }),
        date: `${year}-${month}-${dayOfMonth}`,
        label: currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        isToday: offset === 0,
      };
    });
  }, [businessDate]);

  const filteredRooms = useMemo(
    () => rooms.filter((room) => selectedType === 'All' || room.type === selectedType),
    [rooms, selectedType],
  );

  const roomTypes = useMemo(() => Array.from(new Set(rooms.map((room) => room.type))), [rooms]);
  const occupiedCount = rooms.filter((room) => room.status === 'Occupied').length;
  const readyCount = rooms.filter((room) => room.status === 'Vacant Clean').length;
  const attentionCount = rooms.filter(
    (room) => room.status === 'Vacant Dirty' || room.status === 'Out of Service',
  ).length;

  const summaryCards = [
    { label: 'Rooms in view', value: filteredRooms.length, tone: 'text-slate-100', icon: BedDouble },
    { label: 'In house', value: occupiedCount, tone: 'text-emerald-300', icon: User },
    { label: 'Ready to sell', value: readyCount, tone: 'text-sky-300', icon: Sparkles },
    { label: 'Needs attention', value: attentionCount, tone: 'text-rose-300', icon: ShieldCheck },
  ];

  return (
    <div className="mx-auto w-full max-w-[1760px] space-y-6 pb-10 animate-slide-up">
      <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-900/65 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
        <div className="flex flex-col gap-6 p-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">
              <CalendarDays className="h-4 w-4" /> Front office operations
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-white">Room plan</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Review seven-day inventory, open a reservation, or assign an available room from one workspace.
            </p>
          </div>

          {canCreateReservation && (
            <button onClick={() => onOpenNewBooking()} className="btn-primary min-h-11 justify-center px-5 text-sm">
              <Plus className="h-4 w-4" /> New reservation
            </button>
          )}
        </div>

        <div className="grid border-t border-white/[0.07] sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map(({ label, value, tone, icon: Icon }, index) => (
            <div
              key={label}
              className={`flex items-center gap-3 px-6 py-4 ${index > 0 ? 'border-t border-white/[0.07] sm:border-l sm:border-t-0' : ''} ${index === 2 ? 'sm:border-l-0 xl:border-l' : ''}`}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04]">
                <Icon className={`h-4 w-4 ${tone}`} />
              </div>
              <div>
                <div className={`text-lg font-semibold leading-none ${tone}`}>{value}</div>
                <div className="mt-1 text-xs text-slate-500">{label}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-slate-900/55 p-4 shadow-[0_12px_35px_rgba(0,0,0,0.16)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2" aria-label="Room plan legend">
            {legend.map((item) => (
              <span key={item.label} className="inline-flex items-center gap-2 text-xs text-slate-400">
                <span className={`h-2 w-2 rounded-full ${item.dot}`} />
                {item.label}
              </span>
            ))}
          </div>

          <label className="flex min-h-10 items-center gap-3 rounded-xl border border-white/[0.09] bg-slate-950/50 px-3 text-sm text-slate-400">
            <Filter className="h-4 w-4 text-amber-300" />
            <span className="hidden sm:inline">Room type</span>
            <select
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value)}
              className="min-w-44 bg-transparent font-medium text-slate-100 outline-none"
            >
              <option value="All" className="bg-slate-900">All room types</option>
              {roomTypes.map((roomType) => (
                <option key={roomType} value={roomType} className="bg-slate-900">{roomType}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-900/55 shadow-[0_20px_55px_rgba(0,0,0,0.22)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-30 w-64 border-b border-r border-white/[0.08] bg-slate-900 px-5 py-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Room inventory</span>
                </th>
                {dates.map((date) => (
                  <th
                    key={date.date}
                    className={`min-w-[145px] border-b border-r border-white/[0.06] px-3 py-3 text-center last:border-r-0 ${
                      date.isToday ? 'bg-amber-400/[0.08]' : 'bg-slate-900/80'
                    }`}
                  >
                    <div className={`text-[11px] font-semibold uppercase tracking-wider ${date.isToday ? 'text-amber-300' : 'text-slate-500'}`}>
                      {date.isToday ? 'Today' : date.day}
                    </div>
                    <div className="mt-1 font-semibold text-slate-200">{date.label}</div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filteredRooms.map((room) => {
                const roomBookings = reservations.filter(
                  (reservation) => reservation.roomNumber === room.number
                    && ['Confirmed', 'Checked-In'].includes(reservation.status),
                );

                return (
                  <tr
                    key={room.id}
                    className="group"
                    onMouseEnter={() => setHoveredRoom(room.number)}
                    onMouseLeave={() => setHoveredRoom(null)}
                  >
                    <td className={`sticky left-0 z-20 border-b border-r border-white/[0.07] bg-slate-900 px-5 py-4 transition-colors ${hoveredRoom === room.number ? 'bg-slate-800' : ''}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-mono text-base font-semibold text-white">Room {room.number}</div>
                          <div className="mt-1 truncate text-xs text-slate-500">{room.type} · Floor {room.floor}</div>
                          <span className={`mt-2 inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${roomStatusStyles[room.status]}`}>
                            {room.status}
                          </span>
                        </div>
                        <div className="text-right">
                          {typeof room.currentPrice === 'number' ? (
                            <>
                              <div className="font-semibold text-slate-200">${room.currentPrice}</div>
                              <div className="mt-0.5 text-[10px] text-slate-500">per night</div>
                            </>
                          ) : (
                            <div className="max-w-20 text-[10px] leading-4 text-slate-500">Rate restricted</div>
                          )}
                        </div>
                      </div>
                    </td>

                    {dates.map((date) => {
                      const bookingsForDate = roomBookings.filter(
                        (reservation) => date.date >= reservation.checkIn && date.date < reservation.checkOut,
                      );

                      return (
                        <td
                          key={date.date}
                          className={`h-[92px] border-b border-r border-white/[0.05] p-2 align-middle last:border-r-0 ${date.isToday ? 'bg-amber-400/[0.025]' : ''}`}
                        >
                          {bookingsForDate.length > 0 ? (
                            <div className="flex h-full flex-col gap-2">
                              {bookingsForDate.map((booking) => (
                                <button
                                  key={booking.id}
                                  type="button"
                                  onClick={() => onSelectReservation(booking)}
                                  aria-label={`Open reservation ${booking.code} for ${booking.guestName}`}
                                  className={`flex min-h-[68px] w-full flex-1 flex-col justify-between rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-amber-300 ${
                                    booking.status === 'Checked-In'
                                      ? 'border-emerald-400/20 bg-emerald-400/[0.09] hover:bg-emerald-400/[0.14]'
                                      : 'border-amber-400/20 bg-amber-400/[0.09] hover:bg-amber-400/[0.14]'
                                  }`}
                                >
                                  <span className="flex items-start justify-between gap-2">
                                    <span className="min-w-0 truncate font-semibold text-slate-100">{booking.guestName}</span>
                                    <span className="shrink-0 rounded-md bg-slate-950/40 px-1.5 py-0.5 text-[9px] text-slate-400">{booking.channel}</span>
                                  </span>
                                  <span className="flex items-center justify-between text-[10px] text-slate-400">
                                    <span className="font-mono">{booking.code}</span>
                                    {booking.contactlessCheckInCompleted && (
                                      <span className="flex items-center gap-1 text-cyan-300" title="Contactless digital key active">
                                        <ShieldCheck className="h-3 w-3" /> Key
                                      </span>
                                    )}
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : canCreateReservation && room.status !== 'Out of Service' ? (
                            <button
                              type="button"
                              onClick={() => onOpenNewBooking(room.number, date.date)}
                              aria-label={`Book room ${room.number} for ${date.label}`}
                              className="group/cell flex h-full min-h-[68px] w-full items-center justify-center rounded-xl border border-dashed border-white/[0.06] text-xs text-slate-600 transition-colors hover:border-amber-300/30 hover:bg-amber-300/[0.04] hover:text-amber-200 focus-visible:ring-2 focus-visible:ring-amber-300"
                            >
                              <span className="flex items-center gap-1.5 opacity-0 transition-opacity group-hover/cell:opacity-100 group-focus-visible/cell:opacity-100">
                                <Plus className="h-3.5 w-3.5" /> Assign
                              </span>
                            </button>
                          ) : (
                            <div className="flex h-full min-h-[68px] items-center justify-center rounded-xl bg-white/[0.015] text-[10px] text-slate-600">
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

        {filteredRooms.length === 0 && (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <BedDouble className="h-8 w-8 text-slate-600" />
            <h3 className="mt-4 font-semibold text-slate-200">No rooms match this filter</h3>
            <p className="mt-1 text-sm text-slate-500">Choose another room type to restore the inventory view.</p>
          </div>
        )}
      </section>
    </div>
  );
};
