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
  Occupied: 'border-emerald-300 bg-emerald-100 text-emerald-900',
  'Vacant Clean': 'border-sky-300 bg-sky-100 text-sky-900',
  Reserved: 'border-amber-300 bg-amber-100 text-amber-900',
  'Vacant Dirty': 'border-rose-300 bg-rose-100 text-rose-900',
  'Out of Service': 'border-purple-300 bg-purple-100 text-purple-900',
};

const legend = [
  { label: 'In house', dot: 'bg-emerald-500' },
  { label: 'Confirmed', dot: 'bg-amber-500' },
  { label: 'Ready', dot: 'bg-sky-500' },
  { label: 'Needs service', dot: 'bg-rose-500' },
  { label: 'Out of service', dot: 'bg-purple-500' },
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
    { label: 'Rooms in view', value: filteredRooms.length, tone: 'text-slate-900', icon: BedDouble },
    { label: 'In house', value: occupiedCount, tone: 'text-emerald-800', icon: User },
    { label: 'Ready to sell', value: readyCount, tone: 'text-sky-800', icon: Sparkles },
    { label: 'Needs attention', value: attentionCount, tone: 'text-rose-800', icon: ShieldCheck },
  ];

  return (
    <div className="mx-auto w-full max-w-[1760px] space-y-6 pb-10 animate-slide-up">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="flex flex-col gap-6 p-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-800">
              <CalendarDays className="h-4 w-4 text-amber-700" /> Front office operations
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Room plan</h2>
            <p className="mt-2 text-xs leading-relaxed font-medium text-slate-600">
              Review seven-day inventory, open a reservation, or assign an available room from one workspace.
            </p>
          </div>

          {canCreateReservation && (
            <button onClick={() => onOpenNewBooking()} className="btn-primary min-h-11 justify-center px-5 text-xs font-bold">
              <Plus className="h-4 w-4" /> New reservation
            </button>
          )}
        </div>

        <div className="grid border-t border-slate-200 bg-slate-50 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map(({ label, value, tone, icon: Icon }, index) => (
            <div
              key={label}
              className={`flex items-center gap-3 px-6 py-4 ${index > 0 ? 'border-t border-slate-200 sm:border-l sm:border-t-0' : ''} ${index === 2 ? 'sm:border-l-0 xl:border-l' : ''}`}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-xs">
                <Icon className={`h-4 w-4 ${tone}`} />
              </div>
              <div>
                <div className={`text-lg font-extrabold leading-none ${tone}`}>{value}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">{label}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2" aria-label="Room plan legend">
            {legend.map((item) => (
              <span key={item.label} className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                <span className={`h-2.5 w-2.5 rounded-full ${item.dot}`} />
                {item.label}
              </span>
            ))}
          </div>

          <label className="flex min-h-10 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">
            <Filter className="h-4 w-4 text-amber-700" />
            <span className="hidden sm:inline font-bold">Room type</span>
            <select
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value)}
              className="min-w-44 bg-transparent font-bold text-slate-900 outline-none"
            >
              <option value="All">All room types</option>
              {roomTypes.map((roomType) => (
                <option key={roomType} value={roomType}>{roomType}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-30 w-64 border-b border-r border-slate-200 bg-slate-100 px-5 py-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Room inventory</span>
                </th>
                {dates.map((date) => (
                  <th
                    key={date.date}
                    className={`min-w-[145px] border-b border-r border-slate-200 px-3 py-3 text-center last:border-r-0 ${
                      date.isToday ? 'bg-amber-100/60' : 'bg-slate-50'
                    }`}
                  >
                    <div className={`text-[11px] font-bold uppercase tracking-wider ${date.isToday ? 'text-amber-900' : 'text-slate-500'}`}>
                      {date.isToday ? 'Today' : date.day}
                    </div>
                    <div className="mt-1 font-bold text-slate-900">{date.label}</div>
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
                    <td className={`sticky left-0 z-20 border-b border-r border-slate-200 bg-white px-5 py-4 transition-colors ${hoveredRoom === room.number ? 'bg-slate-50' : ''}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-mono text-base font-bold text-slate-900">Room {room.number}</div>
                          <div className="mt-1 truncate text-xs font-semibold text-slate-500">{room.type} · Floor {room.floor}</div>
                          <span className={`mt-2 inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${roomStatusStyles[room.status]}`}>
                            {room.status}
                          </span>
                        </div>
                        <div className="text-right">
                          {typeof room.currentPrice === 'number' ? (
                            <>
                              <div className="font-bold text-slate-900">${room.currentPrice}</div>
                              <div className="mt-0.5 text-[10px] font-semibold text-slate-500">per night</div>
                            </>
                          ) : (
                            <div className="max-w-20 text-[10px] leading-4 font-semibold text-slate-500">Rate restricted</div>
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
                          className={`h-[92px] border-b border-r border-slate-200 p-2 align-middle last:border-r-0 ${date.isToday ? 'bg-amber-50/40' : ''}`}
                        >
                          {bookingsForDate.length > 0 ? (
                            <div className="flex h-full flex-col gap-2">
                              {bookingsForDate.map((booking) => (
                                <button
                                  key={booking.id}
                                  type="button"
                                  onClick={() => onSelectReservation(booking)}
                                  aria-label={`Open reservation ${booking.code} for ${booking.guestName}`}
                                  className={`flex min-h-[68px] w-full flex-1 flex-col justify-between rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 ${
                                    booking.status === 'Checked-In'
                                      ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100'
                                      : 'border-amber-300 bg-amber-50 hover:bg-amber-100'
                                  }`}
                                >
                                  <span className="flex items-start justify-between gap-2">
                                    <span className="min-w-0 truncate font-bold text-slate-900">{booking.guestName}</span>
                                    <span className="shrink-0 rounded-md bg-white border border-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-700">{booking.channel}</span>
                                  </span>
                                  <span className="flex items-center justify-between text-[10px] font-semibold text-slate-600">
                                    <span className="font-mono font-bold text-slate-900">{booking.code}</span>
                                    {booking.contactlessCheckInCompleted && (
                                      <span className="flex items-center gap-1 font-bold text-cyan-800" title="Contactless digital key active">
                                        <ShieldCheck className="h-3 w-3 text-cyan-600" /> Key
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
                              className="group/cell flex h-full min-h-[68px] w-full items-center justify-center rounded-xl border border-dashed border-slate-300 text-xs font-semibold text-slate-400 transition-colors hover:border-amber-400 hover:bg-amber-50 hover:text-amber-900 focus-visible:ring-2 focus-visible:ring-amber-400"
                            >
                              <span className="flex items-center gap-1.5 opacity-0 transition-opacity group-hover/cell:opacity-100 group-focus-visible/cell:opacity-100">
                                <Plus className="h-3.5 w-3.5" /> Assign
                              </span>
                            </button>
                          ) : (
                            <div className="flex h-full min-h-[68px] items-center justify-center rounded-xl bg-slate-50 text-[10px] font-semibold text-slate-400">
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
            <BedDouble className="h-8 w-8 text-slate-400" />
            <h3 className="mt-4 font-bold text-slate-900">No rooms match this filter</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">Choose another room type to restore the inventory view.</p>
          </div>
        )}
      </section>
    </div>
  );
};
