import React, { FormEvent, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Hotel,
  Loader2,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
} from 'lucide-react';

interface AvailableRoomType {
  roomType: string;
  description: string;
  maxGuests: number;
  availableCount: number;
  nightlyRate: number;
  currency: string;
  amenities: string[];
}

interface AvailabilityResponse {
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  businessDate: string;
  currency: string;
  roomTypes: AvailableRoomType[];
}

interface BookingQuote {
  quoteId: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  roomType: string;
  nightlyRate: number;
  roomTotal: number;
  taxRate: number;
  taxAmount: number;
  grandTotal: number;
  currency: string;
  expiresAt: string;
  ratePlan: string;
  paymentDueNow: number;
  cancellationPolicy: string;
}

interface BookingConfirmation {
  reservationId: string;
  code: string;
  status: 'Confirmed';
  guestName: string;
  guestEmail: string;
  roomType: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  roomTotal: number;
  taxAmount: number;
  grandTotal: number;
  currency: string;
  paymentDueNow: number;
  cancellationPolicy: string;
}

interface BookingEngineProps {
  propertyName?: string;
  locationLabel?: string;
  apiBasePath?: string;
  className?: string;
  onExit?: () => void;
  onConfirmed?: (confirmation: BookingConfirmation) => void;
}

class BookingApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
const steps = ['Choose your stay', 'Select a room', 'Guest details'];

function dateFromNow(days: number) {
  const date = new Date(Date.now() + days * DAY_MS);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: string, days: number) {
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) return dateFromNow(Math.max(1, days));
  return new Date(timestamp + days * DAY_MS).toISOString().slice(0, 10);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `booking-${crypto.randomUUID()}`;
  }
  return `booking-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) {
    throw new BookingApiError(data.error || `Request failed (${response.status})`, response.status);
  }
  return data as T;
}

export const BookingEngine: React.FC<BookingEngineProps> = ({
  propertyName = 'Aura Hotel',
  locationLabel = 'Copenhagen, Denmark',
  apiBasePath = '/api/booking',
  className = '',
  onExit,
  onConfirmed,
}) => {
  const [step, setStep] = useState(1);
  const [checkIn, setCheckIn] = useState(dateFromNow(1));
  const [checkOut, setCheckOut] = useState(dateFromNow(3));
  const [guests, setGuests] = useState(2);
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [quote, setQuote] = useState<BookingQuote | null>(null);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const idempotencyKey = useRef('');

  const minimumCheckOut = useMemo(() => addDays(checkIn, 1), [checkIn]);
  const quotedRoom = useMemo(() => availability?.roomTypes.find(
    (room) => room.roomType === quote?.roomType,
  ), [availability, quote]);

  const handleCheckIn = (value: string) => {
    setCheckIn(value);
    if (checkOut <= value) setCheckOut(addDays(value, 1));
  };

  const searchAvailability = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const query = new URLSearchParams({
        checkIn,
        checkOut,
        guests: String(guests),
      });
      const result = await requestJson<AvailabilityResponse>(
        `${apiBasePath}/availability?${query.toString()}`,
      );
      setAvailability(result);
      setQuote(null);
      setConfirmation(null);
      idempotencyKey.current = '';
      setStep(2);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to search availability.');
    } finally {
      setLoading(false);
    }
  };

  const chooseRoom = async (room: AvailableRoomType) => {
    setError('');
    setLoading(true);
    try {
      const result = await requestJson<BookingQuote>(`${apiBasePath}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkIn, checkOut, guests, roomType: room.roomType }),
      });
      setQuote(result);
      idempotencyKey.current = createIdempotencyKey();
      setStep(3);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to hold that price.');
    } finally {
      setLoading(false);
    }
  };

  const completeBooking = async (event: FormEvent) => {
    event.preventDefault();
    if (!quote) return;
    setError('');
    setLoading(true);
    if (!idempotencyKey.current) idempotencyKey.current = createIdempotencyKey();
    try {
      const result = await requestJson<BookingConfirmation>(`${apiBasePath}/reservations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey.current,
        },
        body: JSON.stringify({
          quoteId: quote.quoteId,
          guest: { firstName, lastName, email, phone },
          specialRequests,
          termsAccepted,
        }),
      });
      setConfirmation(result);
      onConfirmed?.(result);
    } catch (requestError) {
      const message = requestError instanceof Error
        ? requestError.message
        : 'We could not confirm your booking.';
      setError(message);
      if (requestError instanceof BookingApiError && requestError.status === 409) {
        idempotencyKey.current = '';
      }
    } finally {
      setLoading(false);
    }
  };

  const returnToSearch = () => {
    setStep(1);
    setAvailability(null);
    setQuote(null);
    setError('');
    idempotencyKey.current = '';
  };

  const stepper = (
    <ol aria-label="Booking progress" className="grid grid-cols-3 gap-2 sm:gap-4">
      {steps.map((label, index) => {
        const number = index + 1;
        const active = step === number;
        const complete = step > number || confirmation != null;
        return (
          <li
            key={label}
            className="flex items-center min-w-0"
            aria-label={`${number}. ${label}${active ? ', current step' : complete ? ', completed' : ''}`}
            aria-current={active ? 'step' : undefined}
          >
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-extrabold transition-colors ${
              complete
                ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-300'
                : active
                  ? 'border-amber-300 bg-amber-300 text-slate-950 shadow-lg shadow-amber-500/20'
                  : 'border-white/10 bg-white/5 text-gray-500'
            }`}>
              {complete ? <Check className="h-4 w-4" /> : number}
            </div>
            <span className={`ml-2 hidden truncate text-[11px] font-bold sm:block ${
              active ? 'text-amber-200' : complete ? 'text-gray-300' : 'text-gray-600'
            }`}>
              {label}
            </span>
            {number < 3 && <ChevronRight className="mx-1 ml-auto h-4 w-4 shrink-0 text-white/10 sm:mx-3" />}
          </li>
        );
      })}
    </ol>
  );

  if (confirmation) {
    return (
      <section className={`min-h-[760px] rounded-3xl border border-white/10 bg-slate-950 p-4 text-gray-100 shadow-2xl sm:p-8 ${className}`}>
        <div className="mx-auto max-w-4xl">
          <header className="mb-8 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-200 to-amber-500 text-slate-950 shadow-lg shadow-amber-500/20">
                <Hotel className="h-6 w-6" />
              </div>
              <div>
                <div className="font-extrabold tracking-tight">{propertyName}</div>
                <div className="flex items-center gap-1 text-[11px] text-gray-500"><MapPin className="h-3 w-3" /> {locationLabel}</div>
              </div>
            </div>
          </header>
          <div className="mb-10">{stepper}</div>
          <div className="glass-panel-gold overflow-hidden rounded-3xl border border-emerald-400/25 p-6 text-center sm:p-10">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300 ring-8 ring-emerald-400/5">
              <CheckCircle2 className="h-9 w-9" />
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-300">Reservation confirmed</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">We look forward to welcoming you.</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-gray-400">
              Your confirmation is ready. Save the reference below; the hotel can use it to find your stay.
            </p>

            <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-white/10 bg-slate-950/70 p-5 text-left">
              <div className="flex flex-col justify-between gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Confirmation</div>
                  <div className="mt-1 font-mono text-2xl font-black text-amber-300">{confirmation.code}</div>
                </div>
                <span className="w-fit rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300">
                  {confirmation.status}
                </span>
              </div>
              <dl className="grid grid-cols-1 gap-5 pt-5 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-gray-500">Guest</dt><dd className="mt-1 font-semibold text-gray-200">{confirmation.guestName}</dd></div>
                <div><dt className="text-xs text-gray-500">Room</dt><dd className="mt-1 font-semibold text-gray-200">{confirmation.roomType}</dd></div>
                <div><dt className="text-xs text-gray-500">Arrival</dt><dd className="mt-1 font-semibold text-gray-200">{formatDate(confirmation.checkIn)}</dd></div>
                <div><dt className="text-xs text-gray-500">Departure</dt><dd className="mt-1 font-semibold text-gray-200">{formatDate(confirmation.checkOut)}</dd></div>
              </dl>
              <div className="mt-5 flex items-end justify-between gap-4 border-t border-white/10 pt-5">
                <div>
                  <div className="text-xs text-gray-500">Due at the property</div>
                  <div className="mt-1 text-xs text-gray-400">No payment was collected online.</div>
                </div>
                <div className="font-mono text-2xl font-black text-white">{formatMoney(confirmation.grandTotal, confirmation.currency)}</div>
              </div>
            </div>

            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button type="button" onClick={returnToSearch} className="btn-secondary justify-center text-xs">
                Book another stay
              </button>
              {onExit && (
                <button type="button" onClick={onExit} className="btn-primary justify-center text-xs">
                  Return to hotel <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`min-h-[760px] overflow-hidden rounded-3xl border border-white/10 bg-slate-950 text-gray-100 shadow-2xl ${className}`}>
      <div className="relative border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(226,177,83,0.18),transparent_42%),linear-gradient(135deg,#111827,#090d16)] px-4 py-5 sm:px-8">
        <div className="pointer-events-none absolute right-10 top-0 h-36 w-36 rounded-full bg-amber-400/5 blur-3xl" />
        <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-200 to-amber-500 text-slate-950 shadow-lg shadow-amber-500/20">
              <Hotel className="h-6 w-6" />
            </div>
            <div>
              <div className="font-extrabold tracking-tight">{propertyName}</div>
              <div className="flex items-center gap-1 text-[11px] text-gray-500"><MapPin className="h-3 w-3" /> {locationLabel}</div>
            </div>
          </div>
          {onExit && (
            <button type="button" onClick={onExit} className="btn-secondary px-3 py-2 text-xs">
              <ArrowLeft className="h-3.5 w-3.5" /> Exit booking
            </button>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
        <div className="mb-8">{stepper}</div>

        {error && (
          <div role="alert" className="mb-5 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm font-semibold text-rose-200">
            {error}
          </div>
        )}

        {step === 1 && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_0.75fr]">
            <div className="glass-panel-gold rounded-3xl p-5 sm:p-8">
              <div className="mb-8 max-w-2xl">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-200">
                  <Sparkles className="h-3 w-3" /> Book direct
                </span>
                <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl">
                  Your next remarkable stay starts here.
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-gray-400 sm:text-base">
                  Live availability, a flexible rate, and no booking commission. Reserve in a few simple steps.
                </p>
              </div>

              <form onSubmit={searchAvailability} className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 sm:p-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_0.7fr]">
                  <div>
                    <label htmlFor="direct-check-in" className="mb-1.5 block text-xs font-bold text-gray-400">Check-in</label>
                    <div className="relative">
                      <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-300" />
                      <input
                        id="direct-check-in"
                        type="date"
                        min={dateFromNow(0)}
                        value={checkIn}
                        onChange={(event) => handleCheckIn(event.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-slate-900 py-3 pl-10 pr-3 text-sm text-gray-100"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="direct-check-out" className="mb-1.5 block text-xs font-bold text-gray-400">Check-out</label>
                    <div className="relative">
                      <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-300" />
                      <input
                        id="direct-check-out"
                        type="date"
                        min={minimumCheckOut}
                        value={checkOut}
                        onChange={(event) => setCheckOut(event.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-slate-900 py-3 pl-10 pr-3 text-sm text-gray-100"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="direct-guests" className="mb-1.5 block text-xs font-bold text-gray-400">Guests</label>
                    <div className="relative">
                      <UsersRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-300" />
                      <select
                        id="direct-guests"
                        value={guests}
                        onChange={(event) => setGuests(Number(event.target.value))}
                        className="w-full appearance-none rounded-xl border border-white/10 bg-slate-900 py-3 pl-10 pr-8 text-sm text-gray-100"
                      >
                        {[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count} guest{count === 1 ? '' : 's'}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
                <button type="submit" disabled={loading} className="btn-primary mt-5 w-full justify-center py-3 text-sm disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BedDouble className="h-4 w-4" />}
                  {loading ? 'Checking live availability…' : 'Search available rooms'}
                </button>
              </form>
            </div>

            <aside className="glass-panel rounded-3xl p-5 sm:p-6">
              <h2 className="text-sm font-extrabold text-white">Why book direct?</h2>
              <ul className="mt-5 space-y-5">
                {[
                  [ShieldCheck, 'Flexible booking', 'Cancel without charge until the arrival business date.'],
                  [LockKeyhole, 'No card required', 'Reserve now and settle securely at the property.'],
                  [Clock3, 'Current availability', 'Every search checks the same inventory used by the hotel.'],
                ].map(([Icon, title, copy]) => (
                  <li key={String(title)} className="flex gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-300/10 text-amber-300">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div><div className="text-xs font-bold text-gray-200">{title as string}</div><p className="mt-1 text-xs leading-5 text-gray-500">{copy as string}</p></div>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        )}

        {step === 2 && availability && (
          <div>
            <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <button type="button" onClick={() => { setStep(1); setError(''); }} className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-amber-300">
                  <ArrowLeft className="h-3.5 w-3.5" /> Change dates
                </button>
                <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Choose your room</h1>
                <p className="mt-1 text-sm text-gray-500">{formatDate(availability.checkIn)} — {formatDate(availability.checkOut)} · {availability.nights} night{availability.nights === 1 ? '' : 's'} · {availability.guests} guest{availability.guests === 1 ? '' : 's'}</p>
              </div>
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-300">
                Live inventory checked
              </div>
            </div>

            {availability.roomTypes.length === 0 ? (
              <div className="glass-panel rounded-3xl p-10 text-center">
                <BedDouble className="mx-auto h-10 w-10 text-gray-600" />
                <h2 className="mt-4 text-lg font-bold text-gray-200">No rooms match this stay</h2>
                <p className="mt-2 text-sm text-gray-500">Try different dates or fewer guests.</p>
                <button type="button" onClick={() => setStep(1)} className="btn-primary mt-5 text-xs">Adjust your search</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {availability.roomTypes.map((room) => (
                  <article key={room.roomType} className="glass-card group overflow-hidden rounded-3xl">
                    <div className="flex min-h-32 items-end bg-[radial-gradient(circle_at_top_right,rgba(226,177,83,0.22),transparent_46%),linear-gradient(135deg,#1b2538,#111827)] p-5">
                      <div className="flex w-full items-end justify-between gap-4">
                        <div>
                          <span className="rounded-full border border-white/10 bg-slate-950/50 px-2.5 py-1 text-[10px] font-bold text-gray-300">{room.availableCount} available</span>
                          <h2 className="mt-3 text-xl font-black text-white">{room.roomType}</h2>
                        </div>
                        <BedDouble className="h-10 w-10 text-amber-300/70" />
                      </div>
                    </div>
                    <div className="p-5">
                      <p className="min-h-10 text-xs leading-5 text-gray-400">{room.description}</p>
                      <ul className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-gray-400">
                        {room.amenities.slice(0, 4).map((amenity) => (
                          <li key={amenity} className="flex items-center gap-1.5"><Check className="h-3 w-3 text-emerald-300" /> {amenity}</li>
                        ))}
                      </ul>
                      <div className="mt-5 flex items-end justify-between gap-4 border-t border-white/10 pt-5">
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-gray-500">From</div>
                          <div className="font-mono text-xl font-black text-white">{formatMoney(room.nightlyRate, room.currency)}<span className="font-sans text-xs font-medium text-gray-500"> / night</span></div>
                          <div className="mt-1 text-[10px] text-gray-600">Taxes calculated before confirmation</div>
                        </div>
                        <button type="button" onClick={() => chooseRoom(room)} disabled={loading} className="btn-primary shrink-0 text-xs disabled:cursor-not-allowed disabled:opacity-60">
                          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Select <ArrowRight className="h-3.5 w-3.5" /></>}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 3 && quote && (
          <div>
            <button type="button" onClick={() => { setStep(2); setError(''); }} className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-amber-300">
              <ArrowLeft className="h-3.5 w-3.5" /> Choose another room
            </button>
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Complete your reservation</h1>
            <p className="mt-1 text-sm text-gray-500">
              Your price is held until {new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(quote.expiresAt))} while you finish.
            </p>

            <form onSubmit={completeBooking} className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.25fr_0.75fr]">
              <div className="glass-panel rounded-3xl p-5 sm:p-7">
                <div className="mb-5 flex items-center gap-2">
                  <UserRound className="h-4 w-4 text-amber-300" />
                  <h2 className="text-sm font-extrabold text-white">Who is staying?</h2>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="direct-first-name" className="mb-1.5 block text-xs font-bold text-gray-400">First name</label>
                    <input id="direct-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" maxLength={80} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-3 text-sm text-gray-100" required />
                  </div>
                  <div>
                    <label htmlFor="direct-last-name" className="mb-1.5 block text-xs font-bold text-gray-400">Last name</label>
                    <input id="direct-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" maxLength={80} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-3 text-sm text-gray-100" required />
                  </div>
                  <div>
                    <label htmlFor="direct-email" className="mb-1.5 block text-xs font-bold text-gray-400">Email address</label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
                      <input id="direct-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" maxLength={254} className="w-full rounded-xl border border-white/10 bg-slate-900 py-3 pl-10 pr-3 text-sm text-gray-100" required />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="direct-phone" className="mb-1.5 block text-xs font-bold text-gray-400">Phone <span className="font-normal text-gray-600">(optional)</span></label>
                    <div className="relative">
                      <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
                      <input id="direct-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" maxLength={40} className="w-full rounded-xl border border-white/10 bg-slate-900 py-3 pl-10 pr-3 text-sm text-gray-100" />
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <label htmlFor="direct-requests" className="mb-1.5 block text-xs font-bold text-gray-400">Special requests <span className="font-normal text-gray-600">(optional)</span></label>
                  <textarea id="direct-requests" rows={3} value={specialRequests} onChange={(event) => setSpecialRequests(event.target.value)} maxLength={500} placeholder="Arrival time, accessibility needs, dietary notes…" className="w-full resize-y rounded-xl border border-white/10 bg-slate-900 px-3 py-3 text-sm text-gray-100 placeholder:text-gray-700" />
                </div>
                <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-4">
                  <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-400" required />
                  <span className="text-xs leading-5 text-gray-400">I agree to the flexible booking policy and understand that the full balance is payable at the property.</span>
                </label>
              </div>

              <aside className="h-fit rounded-3xl border border-amber-300/20 bg-gradient-to-b from-amber-300/[0.08] to-slate-900 p-5 lg:sticky lg:top-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300">{quote.ratePlan} rate</div>
                    <h2 className="mt-1 text-lg font-black text-white">{quote.roomType}</h2>
                  </div>
                  <BedDouble className="h-7 w-7 text-amber-300" />
                </div>
                {quotedRoom && <p className="mt-3 text-xs leading-5 text-gray-500">{quotedRoom.description}</p>}
                <dl className="mt-5 space-y-3 border-y border-white/10 py-5 text-xs">
                  <div className="flex justify-between gap-3"><dt className="text-gray-500">Stay</dt><dd className="text-right font-semibold text-gray-300">{formatDate(quote.checkIn)}<br />to {formatDate(quote.checkOut)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-gray-500">Guests</dt><dd className="font-semibold text-gray-300">{quote.guests}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-gray-500">Room · {quote.nights} night{quote.nights === 1 ? '' : 's'}</dt><dd className="font-mono text-gray-300">{formatMoney(quote.roomTotal, quote.currency)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-gray-500">Taxes & fees</dt><dd className="font-mono text-gray-300">{formatMoney(quote.taxAmount, quote.currency)}</dd></div>
                </dl>
                <div className="flex items-end justify-between gap-3 pt-5">
                  <div><div className="text-xs text-gray-500">Total stay</div><div className="mt-1 text-[10px] text-emerald-300">Due now: {formatMoney(quote.paymentDueNow, quote.currency)}</div></div>
                  <div className="font-mono text-2xl font-black text-white">{formatMoney(quote.grandTotal, quote.currency)}</div>
                </div>
                <button type="submit" disabled={loading || !termsAccepted} className="btn-primary mt-5 w-full justify-center py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {loading ? 'Confirming safely…' : 'Confirm reservation'}
                </button>
                <div className="mt-3 flex items-start gap-2 text-[10px] leading-4 text-gray-600">
                  <LockKeyhole className="mt-0.5 h-3 w-3 shrink-0" /> No payment details are collected in this pay-at-property flow.
                </div>
              </aside>
            </form>
          </div>
        )}
      </div>
    </section>
  );
};

export type {
  AvailabilityResponse,
  AvailableRoomType,
  BookingConfirmation,
  BookingEngineProps,
  BookingQuote,
};
