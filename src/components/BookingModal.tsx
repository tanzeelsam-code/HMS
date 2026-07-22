import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Room, Reservation, OTAChannel } from '../types';
import { X, Calendar, User, Mail, Phone, ShieldCheck, AlertTriangle } from 'lucide-react';

interface BookingModalProps {
  rooms: Room[];
  reservations: Reservation[];
  initialRoomNumber?: string;
  initialCheckIn?: string;
  businessDate?: string;
  onClose: () => void;
  onSaveReservation: (reservation: Reservation) => void | boolean | Promise<void | boolean>;
}

const DAY_MS = 86_400_000;

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (date: string, amount: number) => {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + amount);
  return formatDateInput(next);
};

export const BookingModal: React.FC<BookingModalProps> = ({
  rooms,
  reservations,
  initialRoomNumber,
  initialCheckIn,
  businessDate,
  onClose,
  onSaveReservation,
}) => {
  const today = useMemo(() => businessDate || formatDateInput(new Date()), [businessDate]);
  const defaultCheckIn = initialCheckIn && initialCheckIn >= today ? initialCheckIn : today;

  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [vipTier, setVipTier] = useState<Reservation['vipTier']>('Member');
  const [roomNumber, setRoomNumber] = useState(initialRoomNumber || '');
  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [checkOut, setCheckOut] = useState(addDays(defaultCheckIn, 1));
  const [channel, setChannel] = useState<OTAChannel>('Direct Web');
  const [guestsCount, setGuestsCount] = useState(1);
  const [paymentTiming, setPaymentTiming] = useState<'arrival' | 'full'>('arrival');
  const [specialRequests, setSpecialRequests] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    firstInputRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  const nights = useMemo(() => {
    const start = new Date(`${checkIn}T12:00:00`).getTime();
    const end = new Date(`${checkOut}T12:00:00`).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
    return Math.round((end - start) / DAY_MS);
  }, [checkIn, checkOut]);

  const availableRooms = useMemo(() => {
    if (nights < 1) return [];
    return rooms.filter((room) => {
      if (room.status === 'Out of Service') return false;
      return !reservations.some((reservation) => (
        reservation.roomNumber === room.number
        && !['Cancelled', 'No-Show', 'Checked-Out'].includes(reservation.status)
        && reservation.checkIn < checkOut
        && reservation.checkOut > checkIn
      ));
    });
  }, [checkIn, checkOut, nights, reservations, rooms]);

  useEffect(() => {
    if (!availableRooms.some((room) => room.number === roomNumber)) {
      setRoomNumber(availableRooms[0]?.number || '');
    }
  }, [availableRooms, roomNumber]);

  const selectedRoom = availableRooms.find((room) => room.number === roomNumber);
  const pricePerNight = selectedRoom?.currentPrice || 0;
  const roomTotal = pricePerNight * nights;
  const taxAmount = Math.round(roomTotal * 0.12 * 100) / 100;
  const grandTotal = roomTotal + taxAmount;
  const paidAmount = paymentTiming === 'full' ? grandTotal : 0;

  const handleCheckInChange = (value: string) => {
    setCheckIn(value);
    if (!checkOut || checkOut <= value) setCheckOut(addDays(value, 1));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!guestName.trim() || !guestEmail.trim()) {
      setError('Guest name and email are required.');
      return;
    }
    if (nights < 1) {
      setError('Check-out must be after check-in.');
      return;
    }
    if (!selectedRoom) {
      setError('No room is available for the selected dates.');
      return;
    }

    const timestamp = Date.now();
    // Room revenue is posted one night at a time by Night Audit. Only the
    // one-time tax and any advance payment belong on the folio at booking.
    const folioItems: Reservation['folioItems'] = [
      {
        id: `f-${timestamp}-tax`,
        date: checkIn,
        description: 'Occupancy tax & resort fee',
        category: 'Tax',
        amount: taxAmount,
        postedBy: 'System Auto',
      },
    ];

    if (paidAmount > 0) {
      folioItems.push({
        id: `f-${timestamp}-payment`,
        date: today,
        description: 'Advance payment',
        category: 'Payment',
        amount: -paidAmount,
        postedBy: channel,
      });
    }

    const reservation: Reservation = {
      id: `pending-${timestamp}`,
      code: 'Pending',
      guestName: guestName.trim(),
      guestEmail: guestEmail.trim(),
      guestPhone: guestPhone.trim(),
      vipTier,
      roomNumber: selectedRoom.number,
      roomType: selectedRoom.type,
      checkIn,
      checkOut,
      nights,
      guestsCount,
      status: 'Confirmed',
      channel,
      // Night Audit divides this contracted room total by the stay length.
      // Taxes remain a separate folio line so room revenue is not overstated.
      totalAmount: roomTotal,
      paidAmount,
      contactlessCheckInCompleted: false,
      folioItems,
      specialRequests: specialRequests.trim() || undefined,
    };

    setSaving(true);
    try {
      const result = await onSaveReservation(reservation);
      if (result === false) setError('The reservation could not be saved. Review the message above and try again.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The reservation could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-slide-up">
      <div
        className="glass-panel w-full max-w-2xl p-6 space-y-5 border border-white/20 shadow-2xl relative max-h-[92vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-dialog-title"
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <h3 id="booking-dialog-title" className="text-lg font-bold text-gray-100">Create New Reservation</h3>
            <p className="text-xs text-gray-400">Availability-checked direct booking and room allocation</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
            aria-label="Close reservation dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-semibold text-rose-200">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="booking-guest-name" className="block text-gray-400 font-semibold mb-1">Guest Full Name</label>
              <div className="relative">
                <User className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={firstInputRef}
                  id="booking-guest-name"
                  type="text"
                  placeholder="e.g. Eleanor Vance"
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-900 border border-white/10 text-gray-200 focus:outline-none focus:border-amber-400/50"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="booking-email" className="block text-gray-400 font-semibold mb-1">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="booking-email"
                  type="email"
                  placeholder="eleanor@example.com"
                  value={guestEmail}
                  onChange={(event) => setGuestEmail(event.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-900 border border-white/10 text-gray-200 focus:outline-none focus:border-amber-400/50"
                  required
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="booking-phone" className="block text-gray-400 font-semibold mb-1">Phone Number</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="booking-phone"
                  type="tel"
                  placeholder="+1 555 000 0000"
                  value={guestPhone}
                  onChange={(event) => setGuestPhone(event.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-900 border border-white/10 text-gray-200"
                />
              </div>
            </div>

            <div>
              <label htmlFor="booking-vip" className="block text-gray-400 font-semibold mb-1">VIP Tier</label>
              <select
                id="booking-vip"
                value={vipTier}
                onChange={(event) => setVipTier(event.target.value as Reservation['vipTier'])}
                className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-gray-200"
              >
                <option value="Member">Member</option>
                <option value="Silver">Silver</option>
                <option value="Gold">Gold VIP</option>
                <option value="Platinum">Platinum VIP</option>
              </select>
            </div>

            <div>
              <label htmlFor="booking-guests" className="block text-gray-400 font-semibold mb-1">Guests</label>
              <input
                id="booking-guests"
                type="number"
                min="1"
                max="8"
                value={guestsCount}
                onChange={(event) => setGuestsCount(Number(event.target.value))}
                className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-gray-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="booking-check-in" className="block text-gray-400 font-semibold mb-1">Check-in Date</label>
              <input
                id="booking-check-in"
                type="date"
                min={today}
                value={checkIn}
                onChange={(event) => handleCheckInChange(event.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-gray-200"
                required
              />
            </div>

            <div>
              <label htmlFor="booking-check-out" className="block text-gray-400 font-semibold mb-1">Check-out Date</label>
              <input
                id="booking-check-out"
                type="date"
                min={addDays(checkIn, 1)}
                value={checkOut}
                onChange={(event) => setCheckOut(event.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-gray-200"
                required
              />
            </div>

            <div>
              <label htmlFor="booking-room" className="block text-gray-400 font-semibold mb-1">Available Room</label>
              <select
                id="booking-room"
                value={roomNumber}
                onChange={(event) => setRoomNumber(event.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-amber-300 font-bold font-mono"
                required
                disabled={availableRooms.length === 0}
              >
                {availableRooms.length === 0 && <option value="">No rooms available</option>}
                {availableRooms.map((room) => (
                  <option key={room.id} value={room.number}>
                    #{room.number} — {room.type} (${room.currentPrice}/night)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="booking-channel" className="block text-gray-400 font-semibold mb-1">Booking Source</label>
              <select
                id="booking-channel"
                value={channel}
                onChange={(event) => setChannel(event.target.value as OTAChannel)}
                className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-gray-200"
              >
                <option value="Direct Web">Direct Web</option>
                <option value="Booking.com">Booking.com</option>
                <option value="Airbnb">Airbnb</option>
                <option value="Expedia">Expedia</option>
                <option value="Agoda">Agoda</option>
              </select>
            </div>

            <div>
              <label htmlFor="booking-payment" className="block text-gray-400 font-semibold mb-1">Payment</label>
              <select
                id="booking-payment"
                value={paymentTiming}
                onChange={(event) => setPaymentTiming(event.target.value as 'arrival' | 'full')}
                className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-gray-200"
              >
                <option value="arrival">Pay at hotel</option>
                <option value="full">Pay in full now</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="booking-requests" className="block text-gray-400 font-semibold mb-1">Special Requests</label>
            <textarea
              id="booking-requests"
              rows={2}
              value={specialRequests}
              onChange={(event) => setSpecialRequests(event.target.value)}
              placeholder="Accessibility needs, arrival time, dietary notes…"
              className="w-full p-2.5 rounded-lg bg-slate-900 border border-white/10 text-gray-200"
            />
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> {nights} night{nights === 1 ? '' : 's'} at ${pricePerNight.toFixed(2)} + 12% tax
              </div>
              <div className="text-base font-extrabold text-amber-300 font-mono">${grandTotal.toFixed(2)}</div>
              <div className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5">
                <ShieldCheck className="w-3 h-3" /> Due now: ${paidAmount.toFixed(2)}
              </div>
            </div>
            <button
              type="submit"
              disabled={saving || !selectedRoom || nights < 1}
              className="btn-primary text-xs px-5 py-2.5 justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Confirm Reservation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
