import React, { FormEvent, useMemo, useRef, useState } from 'react';
import { supabaseFunctionUrl, supabasePublicHeaders } from '../supabase';
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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      ...init,
      headers: { ...supabasePublicHeaders, ...init?.headers },
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      throw new BookingApiError(data.error || `Request failed (${response.status})`, response.status);
    }
    return data as T;
  } catch (err: unknown) {
    if (err instanceof BookingApiError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new BookingApiError('The booking service timed out. Please try again.', 504);
    }
    if (err instanceof TypeError && err.message.toLowerCase().includes('fetch')) {
      throw new BookingApiError('Cannot connect to the booking service. Check your connection and try again.', 503);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}


export const BookingEngine: React.FC<BookingEngineProps> = ({
  propertyName = 'Aura Hotel',
  locationLabel = 'Copenhagen, Denmark',
  apiBasePath = `${supabaseFunctionUrl}/booking`,
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
                ? 'border-emerald-300 bg-emerald-100 text-emerald-900'
                : active
                  ? 'border-amber-400 bg-amber-600 text-white shadow-xs'
                  : 'border-slate-300 bg-slate-100 text-slate-500'
            }`}>
              {complete ? <Check className="h-4 w-4" /> : number}
            </div>
            <span className={`ml-2 hidden truncate text-[11px] font-bold sm:block ${
              active ? 'text-slate-900' : complete ? 'text-slate-700' : 'text-slate-400'
            }`}>
              {label}
            </span>
            {number < 3 && <ChevronRight className="mx-1 ml-auto h-4 w-4 shrink-0 text-slate-300 sm:mx-3" />}
          </li>
        );
      })}
    </ol>
  );

  if (confirmation) {
    return (
      <section className={`min-h-[760px] rounded-3xl border border-slate-200 bg-white p-4 text-slate-900 shadow-xl sm:p-8 ${className}`}>
        <div className="mx-auto max-w-4xl">
          <header className="mb-8 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-600 text-white shadow-xs font-bold">
                <Hotel className="h-6 w-6" />
              </div>
              <div>
                <div className="font-extrabold text-slate-900 tracking-tight">{propertyName}</div>
                <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500"><MapPin className="h-3 w-3 text-slate-400" /> {locationLabel}</div>
              </div>
            </div>
          </header>
          <div className="mb-10">{stepper}</div>
          <div className="overflow-hidden rounded-3xl border border-emerald-300 bg-emerald-50 p-6 text-center sm:p-10 shadow-xs">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-900">
              <CheckCircle2 className="h-9 w-9 text-emerald-700" />
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-900">Reservation confirmed</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">We look forward to welcoming you.</h2>
            <p className="mx-auto mt-3 max-w-xl text-xs leading-relaxed font-semibold text-slate-600">
              Your confirmation is ready. Save the reference below; the hotel can use it to find your stay.
            </p>

            <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-xs">
              <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Confirmation</div>
                  <div className="mt-1 font-mono text-2xl font-extrabold text-amber-900">{confirmation.code}</div>
                </div>
                <span className="w-fit rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-900">
                  {confirmation.status}
                </span>
              </div>
              <dl className="grid grid-cols-1 gap-5 pt-5 text-xs font-semibold sm:grid-cols-2">
                <div><dt className="text-slate-500 font-bold">Guest</dt><dd className="mt-1 font-extrabold text-slate-900">{confirmation.guestName}</dd></div>
                <div><dt className="text-slate-500 font-bold">Room</dt><dd className="mt-1 font-extrabold text-slate-900">{confirmation.roomType}</dd></div>
                <div><dt className="text-slate-500 font-bold">Arrival</dt><dd className="mt-1 font-extrabold text-slate-900">{formatDate(confirmation.checkIn)}</dd></div>
                <div><dt className="text-slate-500 font-bold">Departure</dt><dd className="mt-1 font-extrabold text-slate-900">{formatDate(confirmation.checkOut)}</dd></div>
              </dl>
              <div className="mt-5 flex items-end justify-between gap-4 border-t border-slate-200 pt-5">
                <div>
                  <div className="text-xs font-bold text-slate-500">Due at the property</div>
                  <div className="mt-1 text-xs font-semibold text-slate-600">No payment was collected online.</div>
                </div>
                <div className="font-mono text-2xl font-extrabold text-slate-900">{formatMoney(confirmation.grandTotal, confirmation.currency)}</div>
              </div>
            </div>

            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button type="button" onClick={returnToSearch} className="btn-secondary justify-center text-xs font-bold">
                Book another stay
              </button>
              {onExit && (
                <button type="button" onClick={onExit} className="btn-primary justify-center text-xs font-bold">
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
    <section className={`min-h-[760px] overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-xl ${className}`}>
      <div className="relative border-b border-slate-200 bg-slate-50 px-4 py-5 sm:px-8">
        <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-600 text-white shadow-xs font-bold">
              <Hotel className="h-6 w-6" />
            </div>
            <div>
              <div className="font-extrabold text-slate-900 tracking-tight">{propertyName}</div>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500"><MapPin className="h-3 w-3 text-slate-400" /> {locationLabel}</div>
            </div>
          </div>
          {onExit && (
            <button type="button" onClick={onExit} className="btn-secondary px-3 py-2 text-xs font-bold">
              <ArrowLeft className="h-3.5 w-3.5" /> Exit booking
            </button>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
        <div className="mb-8">{stepper}</div>

        {error && (
          <div role="alert" className="mb-5 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-900">
            {error}
          </div>
        )}

        {step === 1 && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_0.75fr]">
            <div className="surface-panel bg-white border border-slate-200 rounded-3xl p-5 sm:p-8 shadow-xs">
              <div className="mb-8 max-w-2xl">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-900">
                  <Sparkles className="h-3 w-3 text-amber-700" /> Book direct
                </span>
                <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
                  Your next remarkable stay starts here.
                </h1>
                <p className="mt-3 max-w-xl text-xs leading-relaxed font-medium text-slate-600 sm:text-sm">
                  Live availability, a flexible rate, and no booking commission. Reserve in a few simple steps.
                </p>
              </div>

              <form onSubmit={searchAvailability} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_0.7fr]">
                  <div>
                    <label htmlFor="direct-check-in" className="mb-1.5 block text-xs font-bold text-slate-700">Check-in</label>
                    <div className="relative">
                      <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-700" />
                      <input
                        id="direct-check-in"
                        type="date"
                        min={dateFromNow(0)}
                        value={checkIn}
                        onChange={(event) => handleCheckIn(event.target.value)}
                        className="field-control !pl-10 text-xs"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="direct-check-out" className="mb-1.5 block text-xs font-bold text-slate-700">Check-out</label>
                    <div className="relative">
                      <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-700" />
                      <input
                        id="direct-check-out"
                        type="date"
                        min={minimumCheckOut}
                        value={checkOut}
                        onChange={(event) => setCheckOut(event.target.value)}
                        className="field-control !pl-10 text-xs"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="direct-guests" className="mb-1.5 block text-xs font-bold text-slate-700">Guests</label>
                    <div className="relative">
                      <UsersRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-700" />
                      <select
                        id="direct-guests"
                        value={guests}
                        onChange={(event) => setGuests(Number(event.target.value))}
                        className="field-control !pl-10 text-xs"
                      >
                        {[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count} guest{count === 1 ? '' : 's'}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
                <button type="submit" disabled={loading} className="btn-primary mt-5 w-full justify-center py-3 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BedDouble className="h-4 w-4" />}
                  {loading ? 'Checking live availability…' : 'Search available rooms'}
                </button>
              </form>
            </div>

            <aside className="surface-panel bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs">
              <h2 className="text-sm font-extrabold text-slate-900">Why book direct?</h2>
              <ul className="mt-5 space-y-5">
                {[
                  [ShieldCheck, 'Flexible booking', 'Cancel without charge until the arrival business date.'],
                  [LockKeyhole, 'No card required', 'Reserve now and settle securely at the property.'],
                  [Clock3, 'Current availability', 'Every search checks the same inventory used by the hotel.'],
                ].map(([Icon, title, copy]) => (
                  <li key={String(title)} className="flex gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-800 border border-amber-200 font-bold">
                      <Icon className="h-4 w-4 text-amber-700" />
                    </div>
                    <div><div className="text-xs font-bold text-slate-900">{title as string}</div><p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">{copy as string}</p></div>
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
                <button type="button" onClick={() => { setStep(1); setError(''); }} className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-amber-800">
                  <ArrowLeft className="h-3.5 w-3.5" /> Change dates
                </button>
                <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Choose your room</h1>
                <p className="mt-1 text-xs font-semibold text-slate-500">{formatDate(availability.checkIn)} — {formatDate(availability.checkOut)} · {availability.nights} night{availability.nights === 1 ? '' : 's'} · {availability.guests} guest{availability.guests === 1 ? '' : 's'}</p>
              </div>
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900">
                Live inventory checked
              </div>
            </div>

            {availability.roomTypes.length === 0 ? (
              <div className="surface-panel bg-white border border-slate-200 rounded-3xl p-10 text-center shadow-xs">
                <BedDouble className="mx-auto h-10 w-10 text-slate-400" />
                <h2 className="mt-4 text-lg font-bold text-slate-900">No rooms match this stay</h2>
                <p className="mt-2 text-xs font-semibold text-slate-500">Try different dates or fewer guests.</p>
                <button type="button" onClick={() => setStep(1)} className="btn-primary mt-5 text-xs font-bold">Adjust your search</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {availability.roomTypes.map((room) => (
                  <article key={room.roomType} className="surface-panel bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs hover:border-amber-300 transition-all">
                    <div className="flex min-h-32 items-end bg-slate-50 border-b border-slate-200 p-5">
                      <div className="flex w-full items-end justify-between gap-4">
                        <div>
                          <span className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-700">{room.availableCount} available</span>
                          <h2 className="mt-3 text-xl font-extrabold text-slate-900">{room.roomType}</h2>
                        </div>
                        <BedDouble className="h-10 w-10 text-amber-700" />
                      </div>
                    </div>
                    <div className="p-5">
                      <p className="min-h-10 text-xs leading-relaxed font-semibold text-slate-600">{room.description}</p>
                      <ul className="mt-4 grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-600">
                        {room.amenities.slice(0, 4).map((amenity) => (
                          <li key={amenity} className="flex items-center gap-1.5"><Check className="h-3 w-3 text-emerald-600" /> {amenity}</li>
                        ))}
                      </ul>
                      <div className="mt-5 flex items-end justify-between gap-4 border-t border-slate-200 pt-5">
                        <div>
                          <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500">From</div>
                          <div className="font-mono text-xl font-extrabold text-slate-900">{formatMoney(room.nightlyRate, room.currency)}<span className="font-sans text-xs font-semibold text-slate-500"> / night</span></div>
                          <div className="mt-1 text-[10px] font-semibold text-slate-500">Taxes calculated before confirmation</div>
                        </div>
                        <button type="button" onClick={() => chooseRoom(room)} disabled={loading} className="btn-primary shrink-0 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-60">
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
            <button type="button" onClick={() => { setStep(2); setError(''); }} className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-amber-800">
              <ArrowLeft className="h-3.5 w-3.5" /> Choose another room
            </button>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Complete your reservation</h1>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Your price is held until {new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(quote.expiresAt))} while you finish.
            </p>

            <form onSubmit={completeBooking} className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.25fr_0.75fr]">
              <div className="surface-panel bg-white border border-slate-200 rounded-3xl p-5 sm:p-7 shadow-xs">
                <div className="mb-5 flex items-center gap-2">
                  <UserRound className="h-4 w-4 text-amber-700" />
                  <h2 className="text-sm font-bold text-slate-900">Who is staying?</h2>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="direct-first-name" className="mb-1.5 block text-xs font-bold text-slate-700">First name</label>
                    <input id="direct-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" maxLength={80} className="field-control text-xs" required />
                  </div>
                  <div>
                    <label htmlFor="direct-last-name" className="mb-1.5 block text-xs font-bold text-slate-700">Last name</label>
                    <input id="direct-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" maxLength={80} className="field-control text-xs" required />
                  </div>
                  <div>
                    <label htmlFor="direct-email" className="mb-1.5 block text-xs font-bold text-slate-700">Email address</label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input id="direct-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" maxLength={254} className="field-control !pl-10 text-xs" required />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="direct-phone" className="mb-1.5 block text-xs font-bold text-slate-700">Phone <span className="font-normal text-slate-500">(optional)</span></label>
                    <div className="relative">
                      <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input id="direct-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" maxLength={40} className="field-control !pl-10 text-xs" />
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <label htmlFor="direct-requests" className="mb-1.5 block text-xs font-bold text-slate-700">Special requests <span className="font-normal text-slate-500">(optional)</span></label>
                  <textarea id="direct-requests" rows={3} value={specialRequests} onChange={(event) => setSpecialRequests(event.target.value)} maxLength={500} placeholder="Arrival time, accessibility needs, dietary notes…" className="field-control text-xs resize-y" />
                </div>
                <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-600" required />
                  <span className="text-xs leading-relaxed font-semibold text-slate-700">I agree to the flexible booking policy and understand that the full balance is payable at the property.</span>
                </label>
              </div>

              <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-5 lg:sticky lg:top-5 shadow-xs">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800">{quote.ratePlan} rate</div>
                    <h2 className="mt-1 text-lg font-extrabold text-slate-900">{quote.roomType}</h2>
                  </div>
                  <BedDouble className="h-7 w-7 text-amber-700" />
                </div>
                {quotedRoom && <p className="mt-3 text-xs font-medium leading-relaxed text-slate-600">{quotedRoom.description}</p>}
                <dl className="mt-5 space-y-3 border-y border-slate-200 py-5 text-xs font-semibold">
                  <div className="flex justify-between gap-3"><dt className="text-slate-500 font-bold">Stay</dt><dd className="text-right font-bold text-slate-900">{formatDate(quote.checkIn)}<br />to {formatDate(quote.checkOut)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-slate-500 font-bold">Guests</dt><dd className="font-bold text-slate-900">{quote.guests}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-slate-500 font-bold">Room · {quote.nights} night{quote.nights === 1 ? '' : 's'}</dt><dd className="font-mono text-slate-900">{formatMoney(quote.roomTotal, quote.currency)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-slate-500 font-bold">Taxes & fees</dt><dd className="font-mono text-slate-900">{formatMoney(quote.taxAmount, quote.currency)}</dd></div>
                </dl>
                <div className="flex items-end justify-between gap-3 pt-5">
                  <div><div className="text-xs font-bold text-slate-500">Total stay</div><div className="mt-1 text-[10px] font-bold text-emerald-800">Due now: {formatMoney(quote.paymentDueNow, quote.currency)}</div></div>
                  <div className="font-mono text-2xl font-extrabold text-slate-900">{formatMoney(quote.grandTotal, quote.currency)}</div>
                </div>
                <button type="submit" disabled={loading || !termsAccepted} className="btn-primary mt-5 w-full justify-center py-3 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {loading ? 'Confirming safely…' : 'Confirm reservation'}
                </button>
                <div className="mt-3 flex items-start gap-2 text-[10px] font-semibold leading-relaxed text-slate-500">
                  <LockKeyhole className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" /> No payment details are collected in this pay-at-property flow.
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
