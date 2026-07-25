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
  'Posted to Room': 'border-emerald-300 bg-emerald-100 text-emerald-900',
  'Settled Card': 'border-sky-300 bg-sky-100 text-sky-900',
  Pending: 'border-amber-300 bg-amber-100 text-amber-900',
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
    { label: 'In-house guests', value: inHouseReservations.length, icon: UserCheck, tone: 'text-slate-900' },
    { label: 'Posted transactions', value: charges.length, icon: Receipt, tone: 'text-emerald-800' },
    { label: 'Posted value', value: money(postedTotal), icon: DollarSign, tone: 'text-amber-800' },
    { label: 'Active outlets', value: outletCount, icon: Store, tone: 'text-sky-800' },
  ];

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-6 pb-10 animate-slide-up">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="p-6">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-800">
            <Utensils className="h-4 w-4 text-amber-700" /> Guest charges
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Point of sale posting</h2>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed font-medium text-slate-600">
            Post restaurant, lounge, spa, and in-room dining charges to active guest folios.
          </p>
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

      <div className="grid gap-6 xl:grid-cols-[minmax(360px,0.72fr)_minmax(0,1.28fr)]">
        <section className="h-fit rounded-2xl border border-slate-200 bg-white shadow-xs xl:sticky xl:top-6">
          <div className="border-b border-slate-200 px-5 py-5 xl:px-6">
            <h3 className="flex items-center gap-2 font-bold text-slate-900">
              <CreditCard className="h-4 w-4 text-amber-700" /> New folio charge
            </h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">Post against an active, checked-in reservation</p>
          </div>

          <form onSubmit={handlePostCharge} className="space-y-5 p-5 text-xs xl:p-6">
            {error && (
              <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs leading-relaxed font-bold text-rose-900">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="pos-outlet" className="mb-2 block text-xs font-bold text-slate-700">Outlet</label>
              <select
                id="pos-outlet"
                value={outlet}
                onChange={(event) => {
                  setOutlet(event.target.value as PosCharge['outlet']);
                  resetPendingRequest();
                }}
                className="field-control text-xs"
              >
                <option value="Savor Fine Dining">Savor Fine Dining</option>
                <option value="Horizon Lounge & Bar">Horizon Lounge & Bar</option>
                <option value="Serenity Spa">Serenity Spa</option>
                <option value="In-Room Dining">In-Room Dining</option>
              </select>
            </div>

            <div>
              <label htmlFor="pos-room" className="mb-2 block text-xs font-bold text-slate-700">Guest folio</label>
              <select
                id="pos-room"
                value={selectedRoom}
                onChange={(event) => {
                  setSelectedRoom(event.target.value);
                  resetPendingRequest();
                }}
                disabled={inHouseReservations.length === 0}
                className="field-control text-xs disabled:cursor-not-allowed disabled:opacity-50"
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
              <label htmlFor="pos-description" className="mb-2 block text-xs font-bold text-slate-700">Item or service</label>
              <input
                id="pos-description"
                type="text"
                placeholder="Dinner, minibar, spa treatment…"
                value={itemName}
                onChange={(event) => {
                  setItemName(event.target.value);
                  resetPendingRequest();
                }}
                className="field-control text-xs"
                required
              />
            </div>

            <div>
              <label htmlFor="pos-amount" className="mb-2 block text-xs font-bold text-slate-700">Amount (USD)</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
                  className="field-control text-xs font-mono font-bold text-amber-900 !pl-9"
                  required
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Charge preview</div>
                  <div className="mt-1 text-xs font-semibold text-slate-600">{outlet} · Room {selectedRoom || '—'}</div>
                </div>
                <div className="text-lg font-extrabold text-amber-900">
                  {money(Number.isFinite(previewAmount) ? previewAmount : 0)}
                </div>
              </div>
            </div>

            <button type="submit" disabled={!selectedRoom || posting} className="btn-primary min-h-11 w-full justify-center text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50">
              <CreditCard className="h-4 w-4" /> {posting ? 'Posting charge…' : 'Post to room folio'}
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-5 xl:px-6">
            <div>
              <h3 className="flex items-center gap-2 font-bold text-slate-900">
                <Receipt className="h-4 w-4 text-amber-700" /> Recent transactions
              </h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">Latest outlet charges and folio posting status</p>
            </div>
            {pendingCount > 0 && (
              <span className="rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">
                {pendingCount} pending
              </span>
            )}
          </div>

          {charges.length > 0 ? (
            <div className="divide-y divide-slate-200">
              {charges.map((charge) => (
                <article key={charge.id} className="grid gap-4 px-5 py-5 transition-colors hover:bg-slate-50 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center xl:px-6">
                  <div className="flex h-12 w-12 flex-col items-center justify-center rounded-xl border border-amber-300 bg-amber-50">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Room</span>
                    <span className="font-mono text-sm font-extrabold text-amber-900">{charge.roomNumber}</span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-bold text-slate-900">{charge.guestName}</h4>
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${chargeStatusStyles[charge.status]}`}>{charge.status}</span>
                    </div>
                    <div className="mt-2 text-xs font-semibold text-slate-600">
                      <span className="font-bold text-slate-800">{charge.outlet}</span>
                      <span className="mx-2 text-slate-400">·</span>
                      {charge.items.map((item) => `${item.qty > 1 ? `${item.qty}× ` : ''}${item.name}`).join(', ')}
                    </div>
                    <div className="mt-1 text-[11px] font-medium text-slate-500">{charge.time}</div>
                  </div>

                  <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-3 sm:block sm:border-0 sm:pt-0 sm:text-right">
                    <div className="text-lg font-extrabold text-slate-900">{money(charge.total)}</div>
                    <div className="mt-1 flex items-center gap-1 text-[10px] font-bold text-emerald-800 sm:justify-end">
                      {charge.status === 'Posted to Room' && <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
                      {charge.status}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
              <Receipt className="h-9 w-9 text-slate-400" />
              <h4 className="mt-4 font-bold text-slate-900">No POS transactions yet</h4>
              <p className="mt-1 max-w-sm text-xs leading-relaxed font-semibold text-slate-500">Post a charge to an in-house guest to begin the transaction history.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
