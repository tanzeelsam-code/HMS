// Public direct-booking API.
//
// Mount this router at /api/booking *before* the staff requireAuth middleware.
// Quotes are persisted so the browser never controls price, tax, or inventory.
import { Router } from 'express';
import crypto from 'node:crypto';
import { db, tx, uid, today } from '../db.js';
import { postFolioJournal, toMoney } from '../accounting.js';
import { enqueueWebhookEvent } from '../webhooks.js';
import { enqueueWorkflowEvent, processWorkflowEventOutbox } from './workflows.js';
import { getRoomTypeAvailability } from '../inventory.js';

const r = Router();
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_STAY_NIGHTS = 30;
const MAX_SEARCH_DAYS = 730;
const QUOTE_TTL_MS = 15 * 60 * 1000;
const IDEMPOTENCY_RETENTION_MS = 7 * DAY_MS;
const configuredCurrency = process.env.HMS_CURRENCY?.trim().toUpperCase() || '';
const PROPERTY_CURRENCY = /^[A-Z]{3}$/.test(configuredCurrency) ? configuredCurrency : 'USD';
const configuredTaxText = process.env.HMS_TAX_RATE?.trim() || '';
const configuredTaxRate = configuredTaxText ? Number(configuredTaxText) : Number.NaN;
const TAX_RATE = Number.isFinite(configuredTaxRate) && configuredTaxRate >= 0 && configuredTaxRate <= 1
  ? configuredTaxRate
  : 0.12;
const ACTIVE_RESERVATION_STATUSES = "'Confirmed','Checked-In'";

const ROOM_TYPE_DETAILS = new Map([
  ['Standard King', {
    maxGuests: 2,
    description: 'A calm city retreat with a king bed and thoughtful essentials.',
  }],
  ['Deluxe Ocean View', {
    maxGuests: 3,
    description: 'Elevated comfort, sea views, and room to settle in.',
  }],
  ['Executive Suite', {
    maxGuests: 4,
    description: 'A generous suite with separate space to work, meet, and unwind.',
  }],
  ['Presidential Suite', {
    maxGuests: 6,
    description: 'Our signature stay with expansive living and private outdoor space.',
  }],
]);

// These two tables are deliberately colocated with the vertical slice so the
// router can be evaluated without changing db.js. Move them into the formal
// migration system when the application gains versioned migrations.
db.exec(`
CREATE TABLE IF NOT EXISTS booking_quotes (
  id TEXT PRIMARY KEY,
  check_in TEXT NOT NULL,
  check_out TEXT NOT NULL,
  nights INTEGER NOT NULL,
  guests_count INTEGER NOT NULL,
  room_type TEXT NOT NULL,
  nightly_rate REAL NOT NULL,
  room_total REAL NOT NULL,
  tax_rate REAL NOT NULL,
  tax_amount REAL NOT NULL,
  grand_total REAL NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Open',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  reservation_id TEXT REFERENCES reservations(id)
);
CREATE INDEX IF NOT EXISTS idx_booking_quotes_expiry
  ON booking_quotes(status, expires_at);

CREATE TABLE IF NOT EXISTS booking_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  reservation_id TEXT REFERENCES reservations(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_booking_idempotency_created
  ON booking_idempotency(created_at);
`);

const routeError = (status, message) => Object.assign(new Error(message), { status });
const isPlainObject = (value) => value != null
  && typeof value === 'object'
  && !Array.isArray(value);

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) return null;
  return timestamp;
}

function getStay(checkIn, checkOut) {
  const start = parseDate(checkIn);
  const end = parseDate(checkOut);
  if (start == null || end == null || end <= start) {
    throw routeError(400, 'checkIn and checkOut must be valid YYYY-MM-DD dates with checkOut after checkIn');
  }
  const nights = (end - start) / DAY_MS;
  if (checkIn < today()) throw routeError(400, 'checkIn cannot be before the property business date');
  if (nights > MAX_STAY_NIGHTS) {
    throw routeError(400, `Direct bookings are limited to ${MAX_STAY_NIGHTS} nights`);
  }
  if ((start - parseDate(today())) / DAY_MS > MAX_SEARCH_DAYS) {
    throw routeError(400, `Direct bookings can be searched up to ${MAX_SEARCH_DAYS} days ahead`);
  }
  return { checkIn, checkOut, nights };
}

function parseGuests(value) {
  const guests = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isInteger(guests) || guests < 1 || guests > 6) {
    throw routeError(400, 'guests must be an integer between 1 and 6');
  }
  return guests;
}

function parseAmenities(value) {
  try {
    const amenities = JSON.parse(value);
    return Array.isArray(amenities)
      ? amenities.filter((item) => typeof item === 'string').slice(0, 6)
      : [];
  } catch {
    return [];
  }
}

function availableRooms(checkIn, checkOut, roomType = null) {
  const candidates = db.prepare(`
    SELECT rm.id, rm.number, rm.type, rm.floor, rm.status,
      rm.currentPrice, rm.amenities
    FROM rooms rm
    WHERE rm.status != 'Out of Service'
      AND (? IS NULL OR rm.type = ?)
      AND NOT EXISTS (
        SELECT 1 FROM reservations rez
        WHERE rez.roomNumber = rm.number
          AND rez.status IN (${ACTIVE_RESERVATION_STATUSES})
          AND rez.checkIn < ? AND rez.checkOut > ?
      )
    ORDER BY rm.currentPrice, CAST(rm.number AS INTEGER), rm.number
  `).all(roomType, roomType, checkOut, checkIn)
    .filter((room) => Number.isFinite(room.currentPrice) && room.currentPrice >= 0);
  const sellableByType = new Map(getRoomTypeAvailability({
    propertyId: 'prop-main',
    checkIn,
    checkOut,
  }).map((inventory) => [inventory.roomType, inventory.available]));
  const selectedByType = new Map();
  return candidates.filter((room) => {
    const selected = selectedByType.get(room.type) || 0;
    if (selected >= (sellableByType.get(room.type) || 0)) return false;
    selectedByType.set(room.type, selected + 1);
    return true;
  });
}

function publicRoomTypes(stay, guests) {
  const grouped = new Map();
  for (const room of availableRooms(stay.checkIn, stay.checkOut)) {
    const details = ROOM_TYPE_DETAILS.get(room.type);
    if (!details || guests > details.maxGuests) continue;
    const existing = grouped.get(room.type);
    if (existing) {
      existing.availableCount += 1;
      existing.nightlyRate = Math.min(existing.nightlyRate, toMoney(room.currentPrice));
      continue;
    }
    grouped.set(room.type, {
      roomType: room.type,
      description: details.description,
      maxGuests: details.maxGuests,
      availableCount: 1,
      nightlyRate: toMoney(room.currentPrice),
      currency: PROPERTY_CURRENCY,
      amenities: parseAmenities(room.amenities),
    });
  }
  return [...grouped.values()].sort((a, b) => a.nightlyRate - b.nightlyRate);
}

function createReservationCode() {
  const codeExists = db.prepare('SELECT 1 FROM reservations WHERE code = ?');
  for (let attempt = 0; attempt < 100; attempt++) {
    const code = `GH-${crypto.randomInt(100000, 1000000)}`;
    if (!codeExists.get(code)) return code;
  }
  throw new Error('Unable to allocate a unique reservation code');
}

function normalizeRequiredString(value, field, maximumLength) {
  const normalized = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!normalized) throw routeError(400, `${field} is required`);
  if (normalized.length > maximumLength) {
    throw routeError(400, `${field} must be ${maximumLength} characters or fewer`);
  }
  return normalized;
}

function normalizeOptionalString(value, field, maximumLength) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string') throw routeError(400, `${field} must be a string`);
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length > maximumLength) {
    throw routeError(400, `${field} must be ${maximumLength} characters or fewer`);
  }
  return normalized;
}

function pruneBookingArtifacts() {
  const now = new Date().toISOString();
  db.prepare("UPDATE booking_quotes SET status = 'Expired' WHERE status = 'Open' AND expires_at <= ?")
    .run(now);
  const retentionBoundary = new Date(Date.now() - IDEMPOTENCY_RETENTION_MS).toISOString();
  db.prepare('DELETE FROM booking_idempotency WHERE created_at < ?').run(retentionBoundary);
  db.prepare("DELETE FROM booking_quotes WHERE status = 'Expired' AND expires_at < ?")
    .run(new Date(Date.now() - 30 * DAY_MS).toISOString());
}

function serializeQuote(quote) {
  return {
    quoteId: quote.id,
    checkIn: quote.check_in,
    checkOut: quote.check_out,
    nights: quote.nights,
    guests: quote.guests_count,
    roomType: quote.room_type,
    nightlyRate: quote.nightly_rate,
    roomTotal: quote.room_total,
    taxRate: quote.tax_rate,
    taxAmount: quote.tax_amount,
    grandTotal: quote.grand_total,
    currency: quote.currency,
    expiresAt: quote.expires_at,
    ratePlan: 'Flexible',
    paymentDueNow: 0,
    cancellationPolicy: 'Free cancellation until the arrival business date. Pay at the property.',
  };
}

function dispatchReservationCreated(confirmation) {
  try {
    const reservation = db.prepare('SELECT roomNumber FROM reservations WHERE id = ?')
      .get(confirmation.reservationId);
    // New bookings already write this event atomically with the reservation.
    // Enqueue again here to recover legacy idempotency rows created before the
    // outbox existed; the deterministic event key makes this a no-op otherwise.
    enqueueWorkflowEvent('reservation.created', confirmation.reservationId, {
      confirmationCode: confirmation.code,
      guestName: confirmation.guestName,
      roomNumber: reservation?.roomNumber || '',
      roomType: confirmation.roomType,
      checkIn: confirmation.checkIn,
      checkOut: confirmation.checkOut,
      channel: 'Direct Web',
    }, { eventVersion: confirmation.code });
    processWorkflowEventOutbox({ limit: 10 });
  } catch (error) {
    // The booking and its outbox event are already durable. An operator drain
    // or the next booking request can recover this without data loss.
    console.error('[workflow] unable to process reservation.created outbox', error);
  }
}

// GET /api/booking/availability?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&guests=2
r.get('/availability', (req, res) => {
  pruneBookingArtifacts();
  const stay = getStay(req.query.checkIn, req.query.checkOut);
  const guests = parseGuests(req.query.guests ?? '1');
  res.json({
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    nights: stay.nights,
    guests,
    businessDate: today(),
    currency: PROPERTY_CURRENCY,
    roomTypes: publicRoomTypes(stay, guests),
  });
});

// POST /api/booking/quote
r.post('/quote', (req, res) => {
  pruneBookingArtifacts();
  const body = isPlainObject(req.body) ? req.body : {};
  const stay = getStay(body.checkIn, body.checkOut);
  const guests = parseGuests(body.guests);
  const roomType = normalizeRequiredString(body.roomType, 'roomType', 80);
  const details = ROOM_TYPE_DETAILS.get(roomType);
  if (!details) throw routeError(400, 'Unsupported roomType');
  if (guests > details.maxGuests) {
    throw routeError(400, `${roomType} accommodates up to ${details.maxGuests} guests`);
  }
  const candidate = availableRooms(stay.checkIn, stay.checkOut, roomType)[0];
  if (!candidate) throw routeError(409, 'That room type is no longer available for the selected dates');

  const nightlyRate = toMoney(candidate.currentPrice);
  const roomTotal = toMoney(nightlyRate * stay.nights);
  const taxAmount = toMoney(roomTotal * TAX_RATE);
  const now = new Date();
  const quote = {
    id: `quote-${crypto.randomUUID()}`,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    nights: stay.nights,
    guests,
    roomType,
    nightlyRate,
    roomTotal,
    taxAmount,
    grandTotal: toMoney(roomTotal + taxAmount),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + QUOTE_TTL_MS).toISOString(),
  };
  db.prepare(`
    INSERT INTO booking_quotes (
      id, check_in, check_out, nights, guests_count, room_type, nightly_rate,
      room_total, tax_rate, tax_amount, grand_total, currency, status,
      created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', ?, ?)
  `).run(
    quote.id, quote.checkIn, quote.checkOut, quote.nights, quote.guests,
    quote.roomType, quote.nightlyRate, quote.roomTotal, TAX_RATE,
    quote.taxAmount, quote.grandTotal, PROPERTY_CURRENCY,
    quote.createdAt, quote.expiresAt,
  );
  res.status(201).json(serializeQuote(db.prepare('SELECT * FROM booking_quotes WHERE id = ?').get(quote.id)));
});

// POST /api/booking/reservations
// Required header: Idempotency-Key (8-128 URL/header-safe characters).
r.post('/reservations', (req, res) => {
  pruneBookingArtifacts();
  const body = isPlainObject(req.body) ? req.body : {};
  const quoteId = normalizeRequiredString(body.quoteId, 'quoteId', 100);
  const guest = isPlainObject(body.guest) ? body.guest : {};
  const firstName = normalizeRequiredString(guest.firstName, 'guest.firstName', 80);
  const lastName = normalizeRequiredString(guest.lastName, 'guest.lastName', 80);
  const email = normalizeRequiredString(guest.email, 'guest.email', 254).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw routeError(400, 'guest.email must be a valid email address');
  const phone = normalizeOptionalString(guest.phone, 'guest.phone', 40);
  const specialRequests = normalizeOptionalString(body.specialRequests, 'specialRequests', 500);
  if (body.termsAccepted !== true) throw routeError(400, 'The booking terms must be accepted');

  const idempotencyKey = req.get('Idempotency-Key')?.trim() || '';
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    throw routeError(400, 'Idempotency-Key must contain 8-128 URL-safe characters');
  }
  const canonicalRequest = JSON.stringify({
    quoteId,
    guest: { firstName, lastName, email, phone },
    specialRequests,
    termsAccepted: true,
  });
  const requestHash = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const existingRequest = db.prepare(
    'SELECT * FROM booking_idempotency WHERE idempotency_key = ?'
  ).get(idempotencyKey);
  if (existingRequest) {
    if (existingRequest.request_hash !== requestHash) {
      throw routeError(409, 'This Idempotency-Key was already used for a different booking request');
    }
    res.setHeader('Idempotent-Replay', 'true');
    const replayBody = JSON.parse(existingRequest.response_body);
    dispatchReservationCreated(replayBody);
    return res.status(existingRequest.response_status).json(replayBody);
  }

  const confirmation = tx(() => {
    const quote = db.prepare('SELECT * FROM booking_quotes WHERE id = ?').get(quoteId);
    if (!quote) throw routeError(404, 'Quote not found; search again for current availability');
    if (quote.status !== 'Open') {
      throw routeError(409, quote.status === 'Expired'
        ? 'This quote has expired; search again for a current price'
        : 'This quote has already been used');
    }
    if (quote.expires_at <= new Date().toISOString()) {
      db.prepare("UPDATE booking_quotes SET status = 'Expired' WHERE id = ?").run(quote.id);
      throw routeError(409, 'This quote has expired; search again for a current price');
    }

    // Recheck inventory in the same transaction as the reservation write. The
    // persisted quote—not the room's current rate—protects the guest's price.
    const room = availableRooms(
      quote.check_in,
      quote.check_out,
      quote.room_type,
    )[0];
    if (!room) {
      throw routeError(409, 'The quoted inventory was just booked; search again for another room');
    }

    const reservationId = uid('res');
    const reservationCode = createReservationCode();
    const guestName = `${firstName} ${lastName}`;
    db.prepare(`
      INSERT INTO reservations (
        id, code, guestName, guestEmail, guestPhone, vipTier, roomNumber,
        roomType, checkIn, checkOut, nights, guestsCount, status, channel,
        totalAmount, paidAmount, specialRequests, contactlessCheckInCompleted
      ) VALUES (?, ?, ?, ?, ?, 'Member', ?, ?, ?, ?, ?, ?, 'Confirmed',
        'Direct Web', ?, 0, ?, 0)
    `).run(
      reservationId, reservationCode, guestName, email, phone, room.number,
      quote.room_type, quote.check_in, quote.check_out, quote.nights,
      quote.guests_count, quote.room_total, specialRequests || null,
    );

    if (quote.tax_amount > 0) {
      const folioItemId = uid('f');
      db.prepare(`
        INSERT INTO folio_items (
          id, reservation_id, date, description, category, amount, postedBy
        ) VALUES (?, ?, ?, 'Estimated occupancy tax & resort fee', 'Tax', ?, 'Direct Booking Engine')
      `).run(folioItemId, reservationId, quote.check_in, quote.tax_amount);
      postFolioJournal({
        folioItemId,
        date: quote.check_in,
        description: `Estimated occupancy tax & resort fee (${guestName}, room ${room.number})`,
        source: 'Direct Booking Engine',
        category: 'Tax',
        amount: quote.tax_amount,
      });
    }

    // Match the existing PMS workflow: only clean/reserved inventory changes
    // its immediate readiness state; occupied/dirty future inventory stays so.
    if (room.status === 'Vacant Clean' || room.status === 'Reserved') {
      db.prepare(`
        UPDATE rooms
        SET status = 'Reserved', currentGuestName = NULL, status_since = ?
        WHERE number = ?
      `).run(today(), room.number);
    }

    const consumedAt = new Date().toISOString();
    db.prepare(`
      UPDATE booking_quotes
      SET status = 'Consumed', consumed_at = ?, reservation_id = ?
      WHERE id = ?
    `).run(consumedAt, reservationId, quote.id);

    const responseBody = {
      reservationId,
      code: reservationCode,
      status: 'Confirmed',
      guestName,
      guestEmail: email,
      roomType: quote.room_type,
      checkIn: quote.check_in,
      checkOut: quote.check_out,
      nights: quote.nights,
      guests: quote.guests_count,
      roomTotal: quote.room_total,
      taxAmount: quote.tax_amount,
      grandTotal: quote.grand_total,
      currency: quote.currency,
      paymentDueNow: 0,
      cancellationPolicy: 'Free cancellation until the arrival business date. Pay at the property.',
    };
    enqueueWebhookEvent('reservation.created', {
      reservationId,
      code: reservationCode,
      status: 'Confirmed',
      channel: 'Direct Web',
      roomType: quote.room_type,
      checkIn: quote.check_in,
      checkOut: quote.check_out,
      nights: quote.nights,
      guests: quote.guests_count,
      grandTotal: quote.grand_total,
      currency: quote.currency,
    }, {
      database: db,
      requestId: req.id,
      manageTransaction: false,
    });
    enqueueWorkflowEvent('reservation.created', reservationId, {
      confirmationCode: reservationCode,
      guestName,
      roomNumber: room.number,
      roomType: quote.room_type,
      checkIn: quote.check_in,
      checkOut: quote.check_out,
      channel: 'Direct Web',
    }, {
      eventVersion: reservationCode,
      manageTransaction: false,
    });
    db.prepare(`
      INSERT INTO booking_idempotency (
        idempotency_key, request_hash, response_status, response_body,
        reservation_id, created_at
      ) VALUES (?, ?, 201, ?, ?, ?)
    `).run(
      idempotencyKey,
      requestHash,
      JSON.stringify(responseBody),
      reservationId,
      consumedAt,
    );
    return responseBody;
  });

  dispatchReservationCreated(confirmation);
  res.status(201).json(confirmation);
});

// Keep misspelled public booking URLs from falling through to the staff auth
// middleware when this router is mounted before requireAuth.
r.use((req, res) => {
  res.status(404).json({ error: `Booking endpoint not found: ${req.method} ${req.path}` });
});

export default r;
