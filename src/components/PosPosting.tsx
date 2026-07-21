import React, { useState } from 'react';
import { PosCharge, Room } from '../types';
import { Utensils, CreditCard, Plus, CheckCircle2, DollarSign, Receipt } from 'lucide-react';

interface PosPostingProps {
  charges: PosCharge[];
  rooms: Room[];
  onAddPosCharge: (charge: PosCharge) => void;
}

export const PosPosting: React.FC<PosPostingProps> = ({
  charges,
  rooms,
  onAddPosCharge
}) => {
  const [selectedRoom, setSelectedRoom] = useState('101');
  const [outlet, setOutlet] = useState<PosCharge['outlet']>('Savor Fine Dining');
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');

  const handlePostCharge = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName || !itemPrice) return;

    const matchedRoom = rooms.find(r => r.number === selectedRoom);
    const guestName = matchedRoom?.currentGuestName || 'In-House Guest';

    const newCharge: PosCharge = {
      id: `pos-${Date.now()}`,
      time: 'Just now',
      roomNumber: selectedRoom,
      guestName,
      outlet,
      items: [{ name: itemName, price: parseFloat(itemPrice), qty: 1 }],
      total: parseFloat(itemPrice),
      status: 'Posted to Room'
    };

    onAddPosCharge(newCharge);
    setItemName('');
    setItemPrice('');
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
            <div>
              <label className="block text-gray-400 font-semibold mb-1">Select Outlet</label>
              <select
                value={outlet}
                onChange={(e) => setOutlet(e.target.value as any)}
                className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-gray-200 focus:outline-none focus:border-amber-400/50"
              >
                <option value="Savor Fine Dining">Savor Fine Dining</option>
                <option value="Horizon Lounge & Bar">Horizon Lounge & Bar</option>
                <option value="Serenity Spa">Serenity Spa</option>
                <option value="In-Room Dining">In-Room Dining</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-400 font-semibold mb-1">Select Room # & Guest</label>
              <select
                value={selectedRoom}
                onChange={(e) => setSelectedRoom(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-gray-200 font-mono font-bold focus:outline-none focus:border-amber-400/50"
              >
                {rooms.map((r) => (
                  <option key={r.id} value={r.number}>
                    Room #{r.number} - {r.currentGuestName || 'Vacant / Unassigned'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-gray-400 font-semibold mb-1">Item / Service Description</label>
              <input
                type="text"
                placeholder="e.g. Lobster Dinner & Wine, Spa Facial..."
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-gray-200 focus:outline-none focus:border-amber-400/50"
                required
              />
            </div>

            <div>
              <label className="block text-gray-400 font-semibold mb-1">Amount ($ USD)</label>
              <input
                type="number"
                placeholder="0.00"
                value={itemPrice}
                onChange={(e) => setItemPrice(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-amber-300 font-bold font-mono focus:outline-none focus:border-amber-400/50 text-sm"
                required
              />
            </div>

            <button type="submit" className="btn-primary text-xs w-full py-2.5 justify-center">
              <CreditCard className="w-4 h-4" /> Post Charge to Room Folio
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
