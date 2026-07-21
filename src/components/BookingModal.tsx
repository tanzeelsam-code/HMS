import React, { useState } from 'react';
import { Room, Reservation, RoomType, OTAChannel } from '../types';
import { X, Calendar, User, Mail, Phone, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface BookingModalProps {
  rooms: Room[];
  initialRoomNumber?: string;
  onClose: () => void;
  onSaveReservation: (res: Reservation) => void;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  rooms,
  initialRoomNumber,
  onClose,
  onSaveReservation
}) => {
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [vipTier, setVipTier] = useState<Reservation['vipTier']>('Member');
  const [roomNumber, setRoomNumber] = useState(initialRoomNumber || '102');
  const [checkIn, setCheckIn] = useState('2026-07-21');
  const [checkOut, setCheckOut] = useState('2026-07-24');
  const [channel, setChannel] = useState<OTAChannel>('Direct Web');
  const [specialRequests, setSpecialRequests] = useState('');

  const selectedRoom = rooms.find(r => r.number === roomNumber);
  const pricePerNight = selectedRoom ? selectedRoom.currentPrice : 220;
  const nights = 3; // default calculated 3 nights
  const roomTotal = pricePerNight * nights;
  const taxAmount = Math.round(roomTotal * 0.12);
  const grandTotal = roomTotal + taxAmount;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName || !guestEmail) return;

    const newRes: Reservation = {
      id: `res-${Date.now()}`,
      code: `GH-${Math.floor(1000 + Math.random() * 9000)}`,
      guestName,
      guestEmail,
      guestPhone: guestPhone || '+1 (555) 000-1122',
      vipTier,
      roomNumber,
      roomType: selectedRoom ? selectedRoom.type : 'Standard King',
      checkIn,
      checkOut,
      nights,
      guestsCount: 2,
      status: 'Confirmed',
      channel,
      totalAmount: grandTotal,
      paidAmount: grandTotal,
      contactlessCheckInCompleted: false,
      folioItems: [
        { id: `f-${Date.now()}-1`, date: checkIn, description: `Room Charge (${roomNumber})`, category: 'Room Charge', amount: roomTotal, postedBy: 'Front Desk' },
        { id: `f-${Date.now()}-2`, date: checkIn, description: 'Occupancy Tax & Resort Fee', category: 'Tax', amount: taxAmount, postedBy: 'System Auto' },
        { id: `f-${Date.now()}-3`, date: checkIn, description: 'Advance Payment', category: 'Payment', amount: -grandTotal, postedBy: channel }
      ],
      specialRequests
    };

    onSaveReservation(newRes);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-slide-up">
      <div className="glass-panel w-full max-w-xl p-6 space-y-5 border border-white/20 shadow-2xl relative">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <h3 className="text-lg font-bold text-gray-100">Create New Reservation</h3>
            <p className="text-xs text-gray-400">Direct booking & instant room allocation</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-400 font-semibold mb-1">Guest Full Name</label>
              <input
                type="text"
                placeholder="e.g. Eleanor Vance"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-gray-200 focus:outline-none focus:border-amber-400/50"
                required
              />
            </div>

            <div>
              <label className="block text-gray-400 font-semibold mb-1">Email Address</label>
              <input
                type="email"
                placeholder="eleanor@example.com"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-gray-200 focus:outline-none focus:border-amber-400/50"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-gray-400 font-semibold mb-1">Phone Number</label>
              <input
                type="text"
                placeholder="+1 (555) 000-0000"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-gray-200 focus:outline-none focus:border-amber-400/50"
              />
            </div>

            <div>
              <label className="block text-gray-400 font-semibold mb-1">VIP Tier</label>
              <select
                value={vipTier}
                onChange={(e) => setVipTier(e.target.value as any)}
                className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-gray-200 focus:outline-none focus:border-amber-400/50"
              >
                <option value="Member">Member</option>
                <option value="Silver">Silver</option>
                <option value="Gold">Gold VIP</option>
                <option value="Platinum">Platinum VIP</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-400 font-semibold mb-1">Select Room #</label>
              <select
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-amber-300 font-bold font-mono focus:outline-none focus:border-amber-400/50"
              >
                {rooms.map(r => (
                  <option key={r.id} value={r.number}>
                    #{r.number} - {r.type} (${r.currentPrice}/n)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-gray-400 font-semibold mb-1">Check-in Date</label>
              <input
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                className="w-full p-2 rounded-lg bg-slate-900 border border-white/10 text-gray-200"
              />
            </div>

            <div>
              <label className="block text-gray-400 font-semibold mb-1">Check-out Date</label>
              <input
                type="date"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className="w-full p-2 rounded-lg bg-slate-900 border border-white/10 text-gray-200"
              />
            </div>

            <div>
              <label className="block text-gray-400 font-semibold mb-1">Booking Source / OTA</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as any)}
                className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-gray-200"
              >
                <option value="Direct Web">Direct Web</option>
                <option value="Booking.com">Booking.com</option>
                <option value="Airbnb">Airbnb</option>
                <option value="Expedia">Expedia</option>
              </select>
            </div>
          </div>

          {/* Pricing summary */}
          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-amber-500/20 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-gray-400">Total Calculation ({nights} Nights + Tax)</div>
              <div className="text-base font-extrabold text-amber-300 font-mono">${grandTotal}</div>
            </div>
            <button type="submit" className="btn-primary text-xs px-5 py-2.5">
              Confirm Reservation
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
