import React, { useEffect, useMemo, useState } from 'react';
import { PosCharge, Room, Reservation } from '../types';
import {
  CheckCircle2,
  CreditCard,
  DollarSign,
  Receipt,
  Store,
  UserCheck,
  Utensils,
} from 'lucide-react';

interface PosPostingProps {
  charges: PosCharge[];
  rooms: Room[];
  reservations: Reservation[];
  onAddPosCharge: (charge: PosCharge) => void | boolean | Promise<void | boolean>;
}

const chargeStatusStyles: Record<PosCharge['status'], string> = {
  'Posted to Room': 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
  'Settled Card': 'border-sky-400/20 bg-sky-400/10 text-sky-300',
  Pending: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
};

const money = (value: number) => `$${value.toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

export const PosPosting: React.FC<PosPostingProps> = ({
  charges,
  rooms,
  reservations,
  onAddPosCharge,
}) => {
  const [selectedRoom, setSelectedRoom] = useState('');
  const [outlet, setOutlet] = useState<PosCharge['outlet']>('Savor Fine Dining');
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [pendingRequestId, setPendingRequestId] = useState('');

  const inHouseReservations = useMemo(
    () => reservations.filter((reservation) => reservation.status === 'Checked-In'),
    [reservations],
  );

  useEffect(() => {
    if (!inHouseReservations.some((reservation) => reservation.roomNumber === selectedRoom)) {
      setSelectedRoom(inHouseReservations[0]?.roomNumber || '');
    }
  }, [inHouseReservations, selectedRoom]);

  const resetPendingRequest = () => {
    setPendingRequestId('');
    setError('');
  };

  const handlePostCharge = async (event: React.FormEvent) => {
    event.preventDefault();
    if (posting) return;
    const price = Number(itemPrice);
    if (!itemName.trim() || !selectedRoom || !Number.isFinite(price) || price <= 0) {
      setError('Select an in-house room and enter a positive item amount.');
      return;
    }

    const matchedRoom = rooms.find((room) => room.number === selectedRoom);
    const matchedReservation = inHouseReservations.find(
      (reservation) => reservation.roomNumber === selectedRoom,
    );
    if (!matchedReservation) return;
    const guestName = matchedRoom?.currentGuestName || matchedReservation.guestName;

    const requestId = pendingRequestId || `pos-client-${crypto.randomUUID()}`;
    setPendingRequestId(requestId);
    const newCharge: PosCharge = {
      id: requestId,
      time: 'Just now',
      roomNumber: selectedRoom,
      guestName,
      outlet,
      items: [{ name: itemName.trim(), price, qty: 1 }],
      total: price,
      status: 'Posted to Room',
    };

    setPosting(true);
    setError('');
    try {
      const result = await onAddPosCharge(newCharge);
      if (result !== false) {
        setItemName('');
        setItemPrice('');
        setPendingRequestId('');
      } else {
        setError('The charge was not posted. Review the message above and retry; the same request ID will be reused.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to post the POS charge. Retry will not duplicate a completed request.');
    } finally {
      setPosting(false);
    }
  };

  const postedTotal = charges
    .filter((charge) => charge.status === 'Posted to Room')
    .reduce((sum, charge) => sum + charge.total, 0);
  const outletCount = new Set(charges.map((charge) => charge.outlet)).size;
  const pendingCount = charges.filter((charge) => charge.status === 'Pending').length;
  const previewAmount = Number(itemPrice);
  const summaryCards = [
    { label: 'In-house guests', value: inHouseReservations.length, icon: UserCheck, tone: 'text-slate-100' },
    { label: 'Posted transactions', value: charges.length, icon: Receipt, tone: 'text-emerald-300' },
    { label: 'Posted value', value: money(postedTotal), icon: DollarSign, tone: 'text-amber-300' },
    { label: 'Active outlets', value: outletCount, icon: Store, tone: 'text-sky-300' },
  ];

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-6 pb-10 animate-slide-up">
      <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-900/65 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
        <div className="p-6">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">
            <Utensils className="h-4 w-4" /> Guest charges
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-white">Point of sale posting</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Post restaurant, lounge, spa, and in-room dining charges to active guest folios.
          </p>
        </div>

        <div className="grid border-t border-white/[0.07] sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map(({ label, value, icon: Icon, tone }, index) => (
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

      <div className="grid gap-6 xl:grid-cols-[minmax(360px,0.72fr)_minmax(0,1.28fr)]">
        <section className="h-fit rounded-2xl border border-white/[0.08] bg-slate-900/55 shadow-[0_12px_35px_rgba(0,0,0,0.16)] xl:sticky xl:top-6">
          <div className="border-b border-white/[0.07] px-5 py-5 xl:px-6">
            <h3 className="flex items-center gap-2 font-semibold text-slate-100">
              <CreditCard className="h-4 w-4 text-amber-300" /> New folio charge
            </h3>
            <p className="mt-1 text-xs text-slate-500">Post against an active, checked-in reservation</p>
          </div>

          <form onSubmit={handlePostCharge} className="space-y-5 p-5 text-sm xl:p-6">
            {error && (
              <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs leading-5 text-rose-200">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="pos-outlet" className="mb-2 block text-xs font-medium text-slate-400">Outlet</label>
              <select
                id="pos-outlet"
                value={outlet}
                onChange={(event) => {
                  setOutlet(event.target.value as PosCharge['outlet']);
                  resetPendingRequest();
                }}
                className="min-h-11 w-full rounded-xl border border-white/[0.09] bg-slate-950/50 px-3 text-slate-100 outline-none focus:border-amber-300/40"
              >
                <option value="Savor Fine Dining">Savor Fine Dining</option>
                <option value="Horizon Lounge & Bar">Horizon Lounge & Bar</option>
                <option value="Serenity Spa">Serenity Spa</option>
                <option value="In-Room Dining">In-Room Dining</option>
              </select>
            </div>

            <div>
              <label htmlFor="pos-room" className="mb-2 block text-xs font-medium text-slate-400">Guest folio</label>
              <select
                id="pos-room"
                value={selectedRoom}
                onChange={(event) => {
                  setSelectedRoom(event.target.value);
                  resetPendingRequest();
                }}
                disabled={inHouseReservations.length === 0}
                className="min-h-11 w-full rounded-xl border border-white/[0.09] bg-slate-950/50 px-3 text-slate-100 outline-none focus:border-amber-300/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {inHouseReservations.length === 0 && <option value="">No checked-in guests</option>}
                {inHouseReservations.map((reservation) => (
                  <option key={reservation.id} value={reservation.roomNumber}>
                    Room {reservation.roomNumber} · {reservation.guestName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="pos-description" className="mb-2 block text-xs font-medium text-slate-400">Item or service</label>
              <input
                id="pos-description"
                type="text"
                placeholder="Dinner, minibar, spa treatment…"
                value={itemName}
                onChange={(event) => {
                  setItemName(event.target.value);
                  resetPendingRequest();
                }}
                className="min-h-11 w-full rounded-xl border border-white/[0.09] bg-slate-950/50 px-3 text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-amber-300/40"
                required
              />
            </div>

            <div>
              <label htmlFor="pos-amount" className="mb-2 block text-xs font-medium text-slate-400">Amount (USD)</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="pos-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={itemPrice}
                  onChange={(event) => {
                    setItemPrice(event.target.value);
                    resetPendingRequest();
                  }}
                  className="min-h-11 w-full rounded-xl border border-white/[0.09] bg-slate-950/50 pl-9 pr-3 font-mono font-semibold text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-amber-300/40"
                  required
                />
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.07] bg-slate-950/35 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Charge preview</div>
                  <div className="mt-1 text-xs text-slate-400">{outlet} · Room {selectedRoom || '—'}</div>
                </div>
                <div className="text-lg font-semibold text-amber-300">
                  {money(Number.isFinite(previewAmount) ? previewAmount : 0)}
                </div>
              </div>
            </div>

            <button type="submit" disabled={!selectedRoom || posting} className="btn-primary min-h-11 w-full justify-center text-sm disabled:cursor-not-allowed disabled:opacity-50">
              <CreditCard className="h-4 w-4" /> {posting ? 'Posting charge…' : 'Post to room folio'}
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-900/55 shadow-[0_12px_35px_rgba(0,0,0,0.16)]">
          <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-5 xl:px-6">
            <div>
              <h3 className="flex items-center gap-2 font-semibold text-slate-100">
                <Receipt className="h-4 w-4 text-amber-300" /> Recent transactions
              </h3>
              <p className="mt-1 text-xs text-slate-500">Latest outlet charges and folio posting status</p>
            </div>
            {pendingCount > 0 && (
              <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-xs font-medium text-amber-300">
                {pendingCount} pending
              </span>
            )}
          </div>

          {charges.length > 0 ? (
            <div className="divide-y divide-white/[0.06]">
              {charges.map((charge) => (
                <article key={charge.id} className="grid gap-4 px-5 py-5 transition-colors hover:bg-white/[0.02] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center xl:px-6">
                  <div className="flex h-12 w-12 flex-col items-center justify-center rounded-xl border border-amber-400/15 bg-amber-400/[0.06]">
                    <span className="text-[9px] uppercase tracking-wider text-slate-500">Room</span>
                    <span className="font-mono text-sm font-semibold text-amber-200">{charge.roomNumber}</span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold text-slate-100">{charge.guestName}</h4>
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${chargeStatusStyles[charge.status]}`}>{charge.status}</span>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      <span className="font-medium text-slate-400">{charge.outlet}</span>
                      <span className="mx-2 text-slate-700">·</span>
                      {charge.items.map((item) => `${item.qty > 1 ? `${item.qty}× ` : ''}${item.name}`).join(', ')}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-600">{charge.time}</div>
                  </div>

                  <div className="flex items-center justify-between gap-4 border-t border-white/[0.06] pt-3 sm:block sm:border-0 sm:pt-0 sm:text-right">
                    <div className="text-lg font-semibold text-white">{money(charge.total)}</div>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-400 sm:justify-end">
                      {charge.status === 'Posted to Room' && <CheckCircle2 className="h-3 w-3" />}
                      {charge.status}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
              <Receipt className="h-9 w-9 text-slate-600" />
              <h4 className="mt-4 font-semibold text-slate-200">No POS transactions yet</h4>
              <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">Post a charge to an in-house guest to begin the transaction history.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
