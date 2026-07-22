import React, { useEffect, useMemo, useState } from 'react';
import { PosCharge, Room, Reservation } from '../types';
import { Utensils, CreditCard, Plus, CheckCircle2, DollarSign, Receipt } from 'lucide-react';

interface PosPostingProps {
  charges: PosCharge[];
  rooms: Room[];
  reservations: Reservation[];
  onAddPosCharge: (charge: PosCharge) => void | boolean | Promise<void | boolean>;
}

export const PosPosting: React.FC<PosPostingProps> = ({
  charges,
  rooms,
  reservations,
  onAddPosCharge
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

  const handlePostCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (posting) return;
    const price = Number(itemPrice);
    if (!itemName.trim() || !selectedRoom || !Number.isFinite(price) || price <= 0) {
      setError('Select an in-house room and enter a positive item amount.');
      return;
    }

    const matchedRoom = rooms.find(r => r.number === selectedRoom);
    const matchedReservation = inHouseReservations.find((reservation) => reservation.roomNumber === selectedRoom);
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
      status: 'Posted to Room'
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

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-100 tracking-tight">Point of Sale (POS) Folio Posting Terminal</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
              Unified F&B & Spa Billing
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Post restaurant, lounge, room service, or spa charges directly to in-house guest folios.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Post Charge Form */}
        <div className="lg:col-span-5 glass-panel p-5 space-y-4">
          <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
            <Utensils className="w-4 h-4 text-amber-400" /> New POS Terminal Transaction
          </h3>

          <form onSubmit={handlePostCharge} className="space-y-4 text-xs">
            {error && (
              <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-rose-200">
                {error}
              </div>
            )}
            <div>
              <label htmlFor="pos-outlet" className="block text-gray-400 font-semibold mb-1">Select Outlet</label>
              <select
                id="pos-outlet"
                value={outlet}
                onChange={(e) => {
                  setOutlet(e.target.value as PosCharge['outlet']);
                  resetPendingRequest();
                }}
                className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-gray-200 focus:outline-none focus:border-amber-400/50"
              >
                <option value="Savor Fine Dining">Savor Fine Dining</option>
                <option value="Horizon Lounge & Bar">Horizon Lounge & Bar</option>
                <option value="Serenity Spa">Serenity Spa</option>
                <option value="In-Room Dining">In-Room Dining</option>
              </select>
            </div>

            <div>
              <label htmlFor="pos-room" className="block text-gray-400 font-semibold mb-1">Select Room # & Guest</label>
              <select
                id="pos-room"
                value={selectedRoom}
                onChange={(e) => {
                  setSelectedRoom(e.target.value);
                  resetPendingRequest();
                }}
                disabled={inHouseReservations.length === 0}
                className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-gray-200 font-mono font-bold focus:outline-none focus:border-amber-400/50"
              >
                {inHouseReservations.length === 0 && <option value="">No checked-in guests</option>}
                {inHouseReservations.map((reservation) => (
                  <option key={reservation.id} value={reservation.roomNumber}>
                    Room #{reservation.roomNumber} — {reservation.guestName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="pos-description" className="block text-gray-400 font-semibold mb-1">Item / Service Description</label>
              <input
                id="pos-description"
                type="text"
                placeholder="e.g. Lobster Dinner & Wine, Spa Facial..."
                value={itemName}
                onChange={(e) => {
                  setItemName(e.target.value);
                  resetPendingRequest();
                }}
                className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-gray-200 focus:outline-none focus:border-amber-400/50"
                required
              />
            </div>

            <div>
              <label htmlFor="pos-amount" className="block text-gray-400 font-semibold mb-1">Amount ($ USD)</label>
              <input
                id="pos-amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={itemPrice}
                onChange={(e) => {
                  setItemPrice(e.target.value);
                  resetPendingRequest();
                }}
                className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-amber-300 font-bold font-mono focus:outline-none focus:border-amber-400/50 text-sm"
                required
              />
            </div>

            <button type="submit" disabled={!selectedRoom || posting} className="btn-primary text-xs w-full py-2.5 justify-center disabled:opacity-50">
              <CreditCard className="w-4 h-4" /> {posting ? 'Posting Charge…' : 'Post Charge to Room Folio'}
            </button>
          </form>
        </div>

        {/* Live POS Posting History */}
        <div className="lg:col-span-7 glass-panel p-5 space-y-4">
          <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-amber-400" /> Recent POS Posting Transactions
          </h3>

          <div className="space-y-3">
            {charges.map((c) => (
              <div 
                key={c.id}
                className="p-3.5 rounded-xl bg-slate-900/70 border border-white/10 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center font-mono font-bold text-amber-300">
                    #{c.roomNumber}
                  </div>
                  <div>
                    <div className="font-bold text-gray-200">{c.guestName}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      {c.outlet} • {c.items.map(i => i.name).join(', ')}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-extrabold text-sm text-emerald-400">${c.total}</div>
                  <span className="text-[10px] text-gray-500 font-semibold">{c.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
