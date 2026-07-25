import React, { useEffect, useMemo, useState } from 'react';
import { Reservation, BookingStatus } from '../types';
import {
  Award,
  Ban,
  BedDouble,
  CalendarDays,
  CheckCircle2,
  Filter,
  LogOut,
  Mail,
  Phone,
  Plus,
  Receipt,
  Search,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';

interface ReservationsListProps {
  reservations: Reservation[];
  onSelectReservation: (res: Reservation) => void;
  onCheckIn: (resId: string) => void;
  onCheckOut: (resId: string) => void;
  onCancel: (resId: string) => void;
  onNoShow: (resId: string) => void;
  onOpenNewBooking: () => void;
  initialSearchTerm?: string;
  canManageReservations?: boolean;
  businessDate?: string;
}

const vipStyles: Record<Reservation['vipTier'], string> = {
  Platinum: 'border-purple-300 bg-purple-100 text-purple-900',
  Gold: 'border-amber-300 bg-amber-100 text-amber-900',
  Silver: 'border-sky-300 bg-sky-100 text-sky-900',
  Member: 'border-slate-300 bg-slate-100 text-slate-800',
};

const statusStyles: Record<BookingStatus, string> = {
  'Checked-In': 'border-emerald-300 bg-emerald-100 text-emerald-900',
  Confirmed: 'border-amber-300 bg-amber-100 text-amber-900',
  'Checked-Out': 'border-slate-300 bg-slate-100 text-slate-800',
  Cancelled: 'border-rose-300 bg-rose-100 text-rose-900',
  'No-Show': 'border-orange-300 bg-orange-100 text-orange-900',
};

const money = (value: number) => `$${value.toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

export const ReservationsList: React.FC<ReservationsListProps> = ({
  reservations,
  onSelectReservation,
  onCheckIn,
  onCheckOut,
  onCancel,
  onNoShow,
  onOpenNewBooking,
  initialSearchTerm = '',
  canManageReservations = true,
  businessDate,
}) => {
  const today = businessDate || (() => {
    const current = new Date();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    return `${current.getFullYear()}-${month}-${day}`;
  })();
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [channelFilter, setChannelFilter] = useState<string>('All');

  useEffect(() => {
    setSearchTerm(initialSearchTerm);
  }, [initialSearchTerm]);

  const filteredReservations = useMemo(() => reservations.filter((reservation) => {
    const normalizedSearch = searchTerm.toLowerCase();
    const matchesSearch =
      reservation.guestName.toLowerCase().includes(normalizedSearch)
      || reservation.code.toLowerCase().includes(normalizedSearch)
      || reservation.roomNumber.includes(searchTerm)
      || reservation.guestEmail.toLowerCase().includes(normalizedSearch);

    return matchesSearch
      && (statusFilter === 'All' || reservation.status === statusFilter)
      && (channelFilter === 'All' || reservation.channel === channelFilter);
  }), [channelFilter, reservations, searchTerm, statusFilter]);

  const inHouseCount = reservations.filter((reservation) => reservation.status === 'Checked-In').length;
  const arrivalsCount = reservations.filter(
    (reservation) => reservation.status === 'Confirmed' && reservation.checkIn === today,
  ).length;
  const departuresCount = reservations.filter(
    (reservation) => reservation.status === 'Checked-In' && reservation.checkOut === today,
  ).length;

  const summaryCards = [
    { label: 'Active bookings', value: reservations.filter((reservation) => ['Confirmed', 'Checked-In'].includes(reservation.status)).length, icon: BedDouble, tone: 'text-slate-900' },
    { label: 'Arriving today', value: arrivalsCount, icon: CalendarDays, tone: 'text-amber-800' },
    { label: 'Currently in house', value: inHouseCount, icon: UserCheck, tone: 'text-emerald-800' },
    { label: 'Departing today', value: departuresCount, icon: LogOut, tone: 'text-sky-800' },
  ];

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-6 pb-10 animate-slide-up">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-800">
              <Users className="h-4 w-4 text-amber-700" /> Front office
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Reservations</h2>
            <p className="mt-2 text-xs leading-relaxed font-medium text-slate-600">
              Manage arrivals, in-house stays, guest folios, and departure readiness.
            </p>
          </div>
          {canManageReservations && (
            <button onClick={onOpenNewBooking} className="btn-primary min-h-11 justify-center px-5 text-xs font-bold">
              <Plus className="h-4 w-4" /> New reservation
            </button>
          )}
        </div>

        <div className="grid border-t border-slate-200 bg-slate-50 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map(({ label, value, icon: Icon, tone }, index) => (
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
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search reservations</span>
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              aria-label="Search reservations"
              type="text"
              placeholder="Search guest, confirmation code, email, or room"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="field-control !pl-10 text-xs"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2 xl:w-auto">
            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold">
              <Filter className="h-4 w-4 text-amber-700" />
              <span className="text-slate-500 font-bold">Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="min-w-36 bg-transparent font-bold text-slate-900 outline-none"
              >
                <option value="All">All statuses</option>
                <option value="Checked-In">Checked in</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Checked-Out">Checked out</option>
                <option value="Cancelled">Cancelled</option>
                <option value="No-Show">No-show</option>
              </select>
            </label>

            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold">
              <span className="text-slate-500 font-bold">Channel</span>
              <select
                value={channelFilter}
                onChange={(event) => setChannelFilter(event.target.value)}
                className="min-w-36 bg-transparent font-bold text-slate-900 outline-none"
              >
                <option value="All">All channels</option>
                <option value="Direct Web">Direct Web</option>
                <option value="Booking.com">Booking.com</option>
                <option value="Airbnb">Airbnb</option>
                <option value="Expedia">Expedia</option>
                <option value="Agoda">Agoda</option>
              </select>
            </label>
          </div>
        </div>
        <div className="mt-3 text-xs font-medium text-slate-500">
          Showing <span className="font-bold text-slate-900">{filteredReservations.length}</span> of {reservations.length} reservations
        </div>
      </section>

      <section className="space-y-4">
        {filteredReservations.map((reservation) => {
          const totalBalance = Math.round(
            reservation.folioItems.reduce((acc, item) => acc + item.amount, 0) * 100,
          ) / 100;
          const postedRoomRevenue = Math.round(
            reservation.folioItems
              .filter((item) => item.category === 'Room Charge')
              .reduce((sum, item) => sum + item.amount, 0) * 100,
          ) / 100;
          const unpostedContractRoomRevenue = reservation.status === 'Checked-In'
            ? Math.max(0, Math.round((reservation.totalAmount - postedRoomRevenue) * 100) / 100)
            : 0;
          const projectedCheckoutBalance = Math.round(
            (totalBalance + unpostedContractRoomRevenue) * 100,
          ) / 100;
          const canCheckInNow = reservation.checkIn <= today && today < reservation.checkOut;
          const canPrepareCheckout = unpostedContractRoomRevenue > 0.005;
          const canCompleteCheckout = Math.abs(totalBalance) <= 0.005;

          return (
            <article
              key={reservation.id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs transition-colors hover:border-slate-300"
            >
              <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.75fr)] xl:p-6">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border border-amber-300 bg-amber-50">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Room</span>
                    <span className="mt-0.5 font-mono text-base font-extrabold text-amber-900">{reservation.roomNumber}</span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="mr-1 text-base font-bold text-slate-900">{reservation.guestName}</h3>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold ${vipStyles[reservation.vipTier]}`}>
                        <Award className="h-3 w-3" /> {reservation.vipTier}
                      </span>
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusStyles[reservation.status]}`}>
                        {reservation.status}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-3 text-xs font-semibold text-slate-700 sm:grid-cols-3">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Confirmation</div>
                        <div className="mt-1 font-mono font-bold text-slate-900">{reservation.code}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Stay</div>
                        <div className="mt-1">{reservation.nights} night{reservation.nights === 1 ? '' : 's'} · {reservation.roomType}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Channel</div>
                        <div className="mt-1">{reservation.channel}</div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-slate-600">
                      <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-slate-400" /> {reservation.checkIn} → {reservation.checkOut}</span>
                      {reservation.actualCheckOut && <span>Actual departure: {reservation.actualCheckOut}</span>}
                      <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-slate-400" /> {reservation.guestEmail}</span>
                      <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-slate-400" /> {reservation.guestPhone}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Contracted room total</div>
                      <div className="mt-1 text-xl font-extrabold text-slate-900">{money(reservation.totalAmount)}</div>
                    </div>
                    <Receipt className="h-4 w-4 text-amber-700" />
                  </div>
                  <div className="mt-4 border-t border-slate-200 pt-3">
                    <div className={`text-xs font-bold ${totalBalance > 0.005 ? 'text-rose-700' : totalBalance < -0.005 ? 'text-cyan-800' : 'text-emerald-700'}`}>
                      {totalBalance > 0.005
                        ? `${money(totalBalance)} unpaid`
                        : totalBalance < -0.005
                          ? `${money(Math.abs(totalBalance))} ${canPrepareCheckout ? 'advance payment' : 'account credit'}`
                          : 'Folio balanced'}
                    </div>
                    {canPrepareCheckout && (
                      <p className="mt-1 text-[11px] leading-4 font-semibold text-slate-600">
                        After posting {money(unpostedContractRoomRevenue)} room revenue:{' '}
                        <span className={projectedCheckoutBalance > 0.005 ? 'text-rose-700' : projectedCheckoutBalance < -0.005 ? 'text-cyan-800' : 'text-emerald-700'}>
                          {projectedCheckoutBalance > 0.005
                            ? `${money(projectedCheckoutBalance)} due`
                            : projectedCheckoutBalance < -0.005
                              ? `${money(Math.abs(projectedCheckoutBalance))} credit`
                              : 'balanced'}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between xl:px-6">
                <div className="text-xs font-medium text-slate-600">
                  {reservation.specialRequests ? `Special request: ${reservation.specialRequests}` : 'No special requests recorded'}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => onSelectReservation(reservation)}
                    className="btn-secondary min-h-9 px-3 text-xs"
                    title="View and edit folio charges"
                  >
                    <Receipt className="h-3.5 w-3.5 text-amber-700" /> Open folio
                  </button>

                  {canManageReservations && reservation.status === 'Confirmed' && (
                    <>
                      <button
                        onClick={() => onCheckIn(reservation.id)}
                        disabled={!canCheckInNow}
                        title={canCheckInNow ? 'Check in guest' : `Check-in opens on ${reservation.checkIn}`}
                        className="btn-primary min-h-9 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {canCheckInNow ? 'Check in' : `Arrives ${reservation.checkIn}`}
                      </button>
                      {today < reservation.checkIn ? (
                        <button
                          onClick={() => {
                            if (window.confirm(`Cancel reservation ${reservation.code} for ${reservation.guestName}? Its local folio will be fully reversed.`)) onCancel(reservation.id);
                          }}
                          className="btn-secondary min-h-9 border-rose-200 px-3 text-xs text-rose-800 hover:bg-rose-50"
                        >
                          <Ban className="h-3.5 w-3.5 text-rose-600" /> Cancel
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            if (window.confirm(`Mark ${reservation.code} for ${reservation.guestName} as No-Show? The demo policy fully reverses its folio and releases the room.`)) onNoShow(reservation.id);
                          }}
                          className="btn-secondary min-h-9 border-orange-200 px-3 text-xs text-orange-800 hover:bg-orange-50"
                        >
                          <UserX className="h-3.5 w-3.5 text-orange-600" /> Mark no-show
                        </button>
                      )}
                    </>
                  )}

                  {canManageReservations && reservation.status === 'Checked-In' && (
                    <button
                      onClick={() => onCheckOut(reservation.id)}
                      disabled={!canPrepareCheckout && !canCompleteCheckout}
                      title={canPrepareCheckout
                        ? 'Post all remaining contracted room charges, then complete checkout if the projected folio is balanced'
                        : canCompleteCheckout
                          ? 'Check out guest'
                          : 'Settle or refund the finalized folio before checkout'}
                      className="btn-secondary min-h-9 border-sky-300 px-3 text-xs text-sky-900 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40 font-bold"
                    >
                      <LogOut className="h-3.5 w-3.5 text-sky-700" />
                      {canPrepareCheckout
                        ? 'Prepare checkout'
                        : totalBalance > 0.005
                          ? 'Settle folio'
                          : totalBalance < -0.005
                            ? 'Refund credit'
                            : 'Check out'}
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}

        {filteredReservations.length === 0 && (
          <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center">
            <Search className="h-8 w-8 text-slate-400" />
            <h3 className="mt-4 font-bold text-slate-900">No reservations found</h3>
            <p className="mt-1 max-w-sm text-xs leading-relaxed font-semibold text-slate-500">Adjust the search or filters to see more stays.</p>
          </div>
        )}
      </section>
    </div>
  );
};
