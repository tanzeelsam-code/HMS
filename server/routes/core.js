// routes/core.js — rooms, reservations, housekeeping, maintenance, guests,
// POS, pricing rules, channels, metrics.
import { Router } from 'express';
import crypto from 'node:crypto';
import {
  db, tx, uid, today,
  serializeRoom, serializeReservation, serializeChannel,
  serializePosCharge, serializeGuest, serializePricingRule,
} from '../db.js';
import { requireRoles } from '../auth.js';
import { postFolioJournal, toMoney } from '../accounting.js';
import { contractedNightlyRate } from '../stay-pricing.js';
import { enqueueWebhookEvent } from '../webhooks.js';
import { enqueueWorkflowEvent, processWorkflowEventOutbox } from './workflows.js';

const r = Router();
const requireFinanceRole = requireRoles('General Manager', 'Finance');
const requireFrontOfficeRole = requireRoles('General Manager', 'Front Desk');
const requireFolioRole = requireRoles('General Manager', 'Front Desk', 'Finance');
const requireOperationsRole = requireRoles('General Manager', 'Front Desk', 'Housekeeping');
const requireRoomMutationRole = requireRoles('General Manager', 'Front Desk', 'Housekeeping', 'Finance');
const DAY_MS = 24 * 60 * 60 * 1000;
const ROOM_STATUSES = new Set(['Vacant Clean', 'Occupied', 'Vacant Dirty', 'Reserved', 'Out of Service']);
const SUPPORTED_RESERVATION_STATUSES = new Set([
  'Confirmed', 'Checked-In', 'Checked-Out', 'Cancelled', 'No-Show',
]);
const HOUSEKEEPING_STATUSES = new Set(['Pending', 'In-Progress', 'Completed', 'Inspected']);
const HOUSEKEEPING_PRIORITIES = new Set(['Urgent', 'High', 'Normal']);
const MAINTENANCE_CATEGORIES = new Set(['Plumbing', 'Electrical', 'HVAC / AC', 'Furniture', 'Door Lock']);
const MAINTENANCE_PRIORITIES = new Set(['Urgent', 'High', 'Normal']);
const MANUAL_FOLIO_CATEGORIES = new Set([
  'F&B Restaurant', 'Spa & Wellness', 'Minibar', 'Tax', 'Other Income', 'Payment',
]);
const VIP_TIERS = new Set(['Member', 'Silver', 'Gold', 'Platinum']);
const BOOKING_CHANNELS = new Set(['Direct Web', 'Booking.com', 'Airbnb', 'Expedia', 'Agoda']);
const POS_OUTLETS = new Set(['Savor Fine Dining', 'Horizon Lounge & Bar', 'Serenity Spa', 'In-Room Dining']);
const ACTIVE_RESERVATION_STATUSES = "'Confirmed','Checked-In'";
const getRoom = (number) => db.prepare('SELECT * FROM rooms WHERE number = ?').get(number);
const getReservation = (id) => db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
const sendReservation = (res, id) => res.json(serializeReservation(getReservation(id)));

function serializeRoomForRole(room, role) {
  const serialized = serializeRoom(room);
  if (role !== 'Housekeeping') return serialized;
  const { basePrice, currentPrice, ...operationalRoom } = serialized;
  return operationalRoom;
}

const serializeMaintenance = (order) => order && ({
  ...order,
  safetyCritical: !!order.safetyCritical,
});

function createReservationCode() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const code = `GH-${crypto.randomInt(100000, 1000000)}`;
    if (!db.prepare('SELECT 1 FROM reservations WHERE code = ?').get(code)) return code;
  }
  throw new Error('Unable to allocate a unique reservation code');
}

const routeError = (status, message) => Object.assign(new Error(message), { status });
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const addDays = (date, amount) => new Date(
  Date.parse(`${date}T00:00:00.000Z`) + amount * DAY_MS,
).toISOString().slice(0, 10);

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
  return { checkIn, checkOut, nights: (end - start) / DAY_MS };
}

function findOverlappingReservation(roomNumber, checkIn, checkOut, excludeId = null) {
  return db.prepare(`
    SELECT id, code, guestName, status, checkIn, checkOut
    FROM reservations
    WHERE roomNumber = ? AND status IN (${ACTIVE_RESERVATION_STATUSES})
      AND checkIn < ? AND checkOut > ?
      AND (? IS NULL OR id != ?)
    LIMIT 1`).get(roomNumber, checkOut, checkIn, excludeId, excludeId);
}

function assertRoomCanBeReserved(roomNumber, checkIn, checkOut) {
  const room = getRoom(roomNumber);
  if (!room) throw routeError(404, 'Room not found');
  if (room.status === 'Out of Service') {
    throw routeError(409, `Room ${roomNumber} is out of service`);
  }
  const overlap = findOverlappingReservation(roomNumber, checkIn, checkOut);
  if (overlap) {
    throw routeError(409, `Room ${roomNumber} is already booked for an overlapping stay`);
  }
  return room;
}

export function assertReservationCanCheckIn(rez) {
  if (!SUPPORTED_RESERVATION_STATUSES.has(rez.status) || rez.status !== 'Confirmed') {
    throw routeError(409, `Reservation must be Confirmed to check in (current status: ${rez.status})`);
  }
  getStay(rez.checkIn, rez.checkOut);
  const businessDate = today();
  if (businessDate < rez.checkIn) {
    throw routeError(409, `Reservation cannot check in before ${rez.checkIn}`);
  }
  if (businessDate >= rez.checkOut) {
    throw routeError(409, `Reservation stay ended on ${rez.checkOut} and can no longer be checked in`);
  }
  const room = getRoom(rez.roomNumber);
  if (!room) throw routeError(404, 'Assigned room not found');
  if (room.status === 'Out of Service') {
    throw routeError(409, `Room ${rez.roomNumber} is out of service`);
  }
  if (!['Reserved', 'Vacant Clean'].includes(room.status)) {
    throw routeError(409, `Room ${rez.roomNumber} is not ready for check-in (status: ${room.status})`);
  }
  const overlap = findOverlappingReservation(rez.roomNumber, rez.checkIn, rez.checkOut, rez.id);
  if (overlap) {
    throw routeError(409, `Room ${rez.roomNumber} has another overlapping reservation`);
  }
  const occupant = db.prepare(
    "SELECT id FROM reservations WHERE roomNumber = ? AND status = 'Checked-In' AND id != ? LIMIT 1"
  ).get(rez.roomNumber, rez.id);
  if (occupant) throw routeError(409, `Room ${rez.roomNumber} is occupied by another reservation`);
  return room;
}

function postedRoomRevenue(reservationId) {
  const value = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS amount
    FROM folio_items
    WHERE reservation_id = ? AND category = 'Room Charge'
  `).get(reservationId).amount;
  if (!isFiniteNumber(value)) throw new Error('Reservation room revenue is invalid');
  return toMoney(value);
}

function remainingContractRoomRevenue(rez) {
  if (!['Confirmed', 'Checked-In'].includes(rez.status)) return 0;
  return Math.max(0, toMoney(rez.totalAmount - postedRoomRevenue(rez.id)));
}

function projectedFolioBalance(rez) {
  const value = db.prepare(
    'SELECT COALESCE(SUM(amount), 0) AS amount FROM folio_items WHERE reservation_id = ?'
  ).get(rez.id).amount;
  if (!isFiniteNumber(value)) throw new Error('Reservation folio contains an invalid balance');
  return toMoney(value + remainingContractRoomRevenue(rez));
}

// Checkout follows the demo property's explicit full-contract policy. Every
// contracted night is posted before settlement. Future nights on an early
// departure are recognized on the current business date and receive audit
// markers so a failed settlement cannot let Night Audit post them again.
function postContractedRoomNights(rez, businessDate) {
  let posted = 0;
  for (let date = rez.checkIn; date < rez.checkOut; date = addDays(date, 1)) {
    const alreadyPosted = db.prepare(`
      SELECT 1 FROM night_audit_postings
      WHERE business_date = ? AND reservation_id = ?
    `).get(date, rez.id);
    if (alreadyPosted) continue;

    const amount = contractedNightlyRate(rez, date);
    const isEarlyDepartureNight = date > businessDate;
    const postingDate = isEarlyDepartureNight ? businessDate : date;
    const description = isEarlyDepartureNight
      ? `Early departure contract charge (night ${date})`
      : `Room Charge (${rez.roomNumber})`;
    const folioItemId = uid('f');
    db.prepare(`
      INSERT INTO folio_items (id, reservation_id, date, description, category, amount, postedBy)
      VALUES (?, ?, ?, ?, 'Room Charge', ?, 'Checkout')
    `).run(folioItemId, rez.id, postingDate, description, amount);
    const journalEntryId = postFolioJournal({
      folioItemId,
      date: postingDate,
      description: `${description} for room ${rez.roomNumber}`,
      source: 'Checkout Room Posting',
      category: 'Room Charge',
      amount,
    });
    db.prepare(`
      INSERT INTO night_audit_postings
        (business_date, reservation_id, folio_item_id, journal_entry_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(date, rez.id, folioItemId, journalEntryId, new Date().toISOString());
    posted++;
  }
  return posted;
}

function closeConfirmedReservation(current, status, label) {
  const existingFolioItems = db.prepare(
    'SELECT * FROM folio_items WHERE reservation_id = ? ORDER BY date, id'
  ).all(current.id);
  const insertReversal = db.prepare(`
    INSERT INTO folio_items (id, reservation_id, date, description, category, amount, postedBy)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  for (const item of existingFolioItems) {
    const reversalAmount = toMoney(-item.amount);
    if (Math.abs(reversalAmount) < 0.005) continue;
    const folioItemId = uid('f');
    const description = `${label} reversal: ${item.description}`;
    insertReversal.run(folioItemId, current.id, today(), description, item.category, reversalAmount, label);
    postFolioJournal({
      folioItemId,
      // Offset future-dated estimates on their source date; reverse entries
      // already recognized in the past on the current business date.
      date: item.date && item.date > today() ? item.date : today(),
      description: `${description} (${current.guestName}, room ${current.roomNumber})`,
      source: `Reservation ${label}`,
      category: item.category,
      amount: reversalAmount,
    });
  }
  db.prepare('UPDATE reservations SET status = ?, paidAmount = 0 WHERE id = ?').run(status, current.id);
  const otherActiveStay = db.prepare(`
    SELECT id FROM reservations
    WHERE roomNumber = ? AND id != ? AND status IN ('Confirmed','Checked-In')
    LIMIT 1`).get(current.roomNumber, current.id);
  if (!otherActiveStay) {
    db.prepare("UPDATE rooms SET status = 'Vacant Clean', currentGuestName = NULL, status_since = ? WHERE number = ? AND status = 'Reserved'")
      .run(today(), current.roomNumber);
  }
}

// ------------------------------------------------------------------ rooms ----
r.get('/rooms', (req, res) => {
  res.json(db.prepare('SELECT * FROM rooms ORDER BY number').all()
    .map((room) => serializeRoomForRole(room, req.user.role)));
});

r.patch('/rooms/:number', requireRoomMutationRole, (req, res) => {
  const room = getRoom(req.params.number);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const { status, currentPrice } = req.body || {};
  if (status != null && !['General Manager', 'Front Desk', 'Housekeeping'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Room status changes require General Manager, Front Desk, or Housekeeping' });
  }
  if (currentPrice != null && !['General Manager', 'Finance'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Room price changes require General Manager or Finance' });
  }
  if (status != null && !ROOM_STATUSES.has(status)) {
    return res.status(400).json({ error: `Unsupported room status: ${status}` });
  }
  if (status === 'Occupied' || status === 'Reserved') {
    return res.status(409).json({ error: `${status} is managed by reservation check-in and booking workflows` });
  }
  if (status != null && room.status === 'Occupied') {
    return res.status(409).json({ error: 'Check out or relocate the in-house guest before changing this room status' });
  }
  if (status === 'Vacant Clean') {
    const activeCleaningTask = db.prepare(`
      SELECT id FROM housekeeping_tasks
      WHERE roomNumber = ? AND taskType != 'Maintenance Inspect'
        AND status IN ('Pending','In-Progress')
      LIMIT 1`).get(room.number);
    if (activeCleaningTask) {
      return res.status(409).json({ error: 'Complete the active housekeeping task before releasing this room as clean' });
    }
  }
  if (currentPrice != null && (!isFiniteNumber(currentPrice) || currentPrice < 0)) {
    return res.status(400).json({ error: 'currentPrice must be a finite non-negative number' });
  }
  db.prepare('UPDATE rooms SET status = COALESCE(?, status), currentPrice = COALESCE(?, currentPrice), status_since = CASE WHEN ? IS NOT NULL THEN ? ELSE status_since END WHERE number = ?')
    .run(status ?? null, currentPrice ?? null, status ?? null, today(), req.params.number);
  res.json(serializeRoomForRole(getRoom(req.params.number), req.user.role));
});

// ------------------------------------------------------------ reservations ----
r.get('/reservations', requireFolioRole, (req, res) => {
  res.json(db.prepare('SELECT * FROM reservations ORDER BY roomNumber').all().map(serializeReservation));
});

r.post('/reservations', requireFrontOfficeRole, (req, res) => {
  const b = req.body || {};
  const guestName = typeof b.guestName === 'string' ? b.guestName.trim() : '';
  const roomNumber = b.roomNumber == null ? '' : String(b.roomNumber).trim();
  if (!guestName || !roomNumber || !b.checkIn || !b.checkOut) {
    return res.status(400).json({ error: 'guestName, roomNumber, checkIn, checkOut are required' });
  }
  const status = b.status ?? 'Confirmed';
  if (!SUPPORTED_RESERVATION_STATUSES.has(status)) {
    return res.status(400).json({ error: `Unsupported reservation status: ${status}` });
  }
  if (status !== 'Confirmed') {
    return res.status(400).json({ error: 'New reservations must start with Confirmed status' });
  }
  const stay = getStay(b.checkIn, b.checkOut);
  if (stay.checkOut <= today()) {
    return res.status(400).json({ error: 'New reservations must have a future check-out date' });
  }
  const guestsCount = b.guestsCount ?? 1;
  if (!Number.isInteger(guestsCount) || guestsCount < 1) {
    return res.status(400).json({ error: 'guestsCount must be a positive integer' });
  }
  if (b.totalAmount != null && (!isFiniteNumber(b.totalAmount) || b.totalAmount < 0)) {
    return res.status(400).json({ error: 'totalAmount must be a finite non-negative number' });
  }
  if (b.guestEmail != null && (typeof b.guestEmail !== 'string' || !/^\S+@\S+\.\S+$/.test(b.guestEmail.trim()))) {
    return res.status(400).json({ error: 'guestEmail must be a valid email address' });
  }
  if (b.guestPhone != null && typeof b.guestPhone !== 'string') {
    return res.status(400).json({ error: 'guestPhone must be a string' });
  }
  if (b.vipTier != null && !VIP_TIERS.has(b.vipTier)) {
    return res.status(400).json({ error: 'Unsupported vipTier' });
  }
  if (b.channel != null && !BOOKING_CHANNELS.has(b.channel)) {
    return res.status(400).json({ error: 'Unsupported booking channel' });
  }
  if (b.specialRequests != null && typeof b.specialRequests !== 'string') {
    return res.status(400).json({ error: 'specialRequests must be a string' });
  }
  if (b.folioItems != null || b.paidAmount != null) {
    return res.status(400).json({ error: 'Use taxAmount and paymentAmount; raw initial folio entries are not accepted' });
  }
  if (b.taxAmount != null) {
    return res.status(400).json({ error: 'taxAmount is calculated by the server' });
  }
  if (b.paymentAmount != null && (!isFiniteNumber(b.paymentAmount) || b.paymentAmount < 0)) {
    return res.status(400).json({ error: 'paymentAmount must be a finite non-negative number' });
  }
  const paymentAmount = toMoney(b.paymentAmount ?? 0);
  const id = uid('res');
  tx(() => {
    // Recheck availability inside the same transaction as the reservation and
    // room-state writes so concurrent requests cannot both claim the room.
    const room = assertRoomCanBeReserved(roomNumber, stay.checkIn, stay.checkOut);
    const totalAmount = toMoney(b.totalAmount ?? room.currentPrice * stay.nights);
    if (!isFiniteNumber(totalAmount) || totalAmount < 0) {
      throw routeError(409, `Room ${roomNumber} has an invalid rate for this stay`);
    }
    const standardRoomTotal = toMoney(room.currentPrice * stay.nights);
    if (req.user.role === 'Front Desk' && Math.abs(totalAmount - standardRoomTotal) > 0.005) {
      throw routeError(403, 'Front Desk reservations must use the current room rate');
    }
    const taxAmount = toMoney(totalAmount * 0.12);
    if (paymentAmount > totalAmount + taxAmount) {
      throw routeError(400, 'paymentAmount cannot exceed the initial room and tax total');
    }
    const reservationCode = createReservationCode();
    db.prepare(`INSERT INTO reservations (id, code, guestName, guestEmail, guestPhone, vipTier, roomNumber, roomType,
      checkIn, checkOut, nights, guestsCount, status, channel, totalAmount, paidAmount, specialRequests, contactlessCheckInCompleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, reservationCode,
      guestName, b.guestEmail?.trim() || '', b.guestPhone?.trim() || '', b.vipTier || 'Member',
      roomNumber, room.type, stay.checkIn, stay.checkOut, stay.nights,
      guestsCount, status, b.channel || 'Direct Web',
      totalAmount, paymentAmount,
      b.specialRequests?.trim() || null, 0
    );
    const insertFolio = db.prepare(`
      INSERT INTO folio_items (id, reservation_id, date, description, category, amount, postedBy)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const initialFolioItems = [
      ...(taxAmount > 0 ? [{
        date: stay.checkIn,
        description: 'Estimated occupancy tax & resort fee',
        category: 'Tax',
        amount: taxAmount,
        postedBy: `Reservation · ${req.user.name}`,
      }] : []),
      ...(paymentAmount > 0 ? [{
        date: today(),
        description: 'Advance payment',
        category: 'Payment',
        amount: -paymentAmount,
        postedBy: `Reservation · ${req.user.name}`,
      }] : []),
    ];
    for (const item of initialFolioItems) {
      const folioItemId = uid('f');
      insertFolio.run(folioItemId, id, item.date, item.description, item.category, item.amount, item.postedBy);
      postFolioJournal({
        folioItemId,
        date: item.date,
        description: `${item.description} (${guestName}, room ${roomNumber})`,
        source: 'Reservation Folio',
        category: item.category,
        amount: item.amount,
      });
    }
    // Only clean inventory becomes Reserved. Future stays can still be sold
    // against occupied or dirty rooms without hiding their live readiness.
    if (room.status === 'Vacant Clean' || room.status === 'Reserved') {
      db.prepare("UPDATE rooms SET status = 'Reserved', currentGuestName = NULL, status_since = ? WHERE number = ?")
        .run(today(), roomNumber);
    }
    enqueueWebhookEvent('reservation.created', {
      reservationId: id,
      code: reservationCode,
      status,
      channel: b.channel || 'Direct Web',
      roomType: room.type,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      nights: stay.nights,
      guests: guestsCount,
      grandTotal: toMoney(totalAmount + taxAmount),
    }, { database: db, requestId: req.id, manageTransaction: false });
    enqueueWorkflowEvent('reservation.created', id, {
      confirmationCode: reservationCode,
      guestName,
      roomNumber,
      roomType: room.type,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      channel: b.channel || 'Direct Web',
    }, {
      eventVersion: reservationCode,
      actor: req.user.email,
      manageTransaction: false,
    });
  });
  const createdReservation = serializeReservation(getReservation(id));
  try {
    processWorkflowEventOutbox({ limit: 10 });
  } catch (error) {
    console.error('[workflow] unable to process reservation.created outbox', error);
  }
  res.status(201).json(createdReservation);
});

r.post('/reservations/:id/cancel', requireFrontOfficeRole, (req, res) => {
  const rez = getReservation(req.params.id);
  if (!rez) return res.status(404).json({ error: 'Reservation not found' });
  tx(() => {
    const current = getReservation(rez.id);
    if (current.status !== 'Confirmed') {
      throw routeError(409, `Only Confirmed reservations can be cancelled (current status: ${current.status})`);
    }
    if (today() >= current.checkIn) {
      throw routeError(409, 'The arrival date has begun; use Mark No-Show instead of cancellation');
    }
    closeConfirmedReservation(current, 'Cancelled', 'Cancellation');
  });
  sendReservation(res, rez.id);
});

r.post('/reservations/:id/no-show', requireFrontOfficeRole, (req, res) => {
  const rez = getReservation(req.params.id);
  if (!rez) return res.status(404).json({ error: 'Reservation not found' });
  tx(() => {
    const current = getReservation(rez.id);
    if (current.status !== 'Confirmed') {
      throw routeError(409, `Only Confirmed reservations can be marked No-Show (current status: ${current.status})`);
    }
    if (today() < current.checkIn) {
      throw routeError(409, `Reservation cannot be marked No-Show before ${current.checkIn}`);
    }
    // The local demo uses a no-penalty policy: all taxes, deposits, and other
    // pre-arrival folio entries are reversed and held inventory is released.
    closeConfirmedReservation(current, 'No-Show', 'No-Show');
  });
  sendReservation(res, rez.id);
});

r.post('/reservations/:id/check-in', requireFrontOfficeRole, (req, res) => {
  const rez = getReservation(req.params.id);
  if (!rez) return res.status(404).json({ error: 'Reservation not found' });
  tx(() => {
    // Re-read and validate in the write transaction to avoid stale status or
    // room availability decisions.
    const current = getReservation(rez.id);
    assertReservationCanCheckIn(current);
    db.prepare("UPDATE reservations SET status = 'Checked-In' WHERE id = ?").run(rez.id);
    db.prepare("UPDATE rooms SET status = 'Occupied', currentGuestName = ?, status_since = ? WHERE number = ?")
      .run(current.guestName, today(), current.roomNumber);
  });
  sendReservation(res, rez.id);
});

r.post('/reservations/:id/check-out', requireFrontOfficeRole, (req, res) => {
  const rez = getReservation(req.params.id);
  if (!rez) return res.status(404).json({ error: 'Reservation not found' });
  const result = tx(() => {
    const current = getReservation(rez.id);
    if (current.status !== 'Checked-In') {
      throw routeError(409, 'Reservation is not Checked-In');
    }
    const roomNightsPosted = postContractedRoomNights(current, today());
    const balance = db.prepare(
      'SELECT COALESCE(SUM(amount), 0) AS amount FROM folio_items WHERE reservation_id = ?'
    ).get(current.id).amount;
    if (!isFiniteNumber(balance)) throw new Error('Reservation folio contains an invalid balance');
    if (Math.abs(balance) > 0.005) {
      return { checkedOut: false, balance, roomNightsPosted };
    }
    db.prepare("UPDATE reservations SET status = 'Checked-Out', actualCheckOut = ? WHERE id = ?")
      .run(today(), current.id);
    db.prepare("UPDATE rooms SET status = 'Vacant Dirty', currentGuestName = NULL, status_since = ? WHERE number = ?")
      .run(today(), current.roomNumber);
    db.prepare(`INSERT INTO housekeeping_tasks (id, roomNumber, roomType, floor, taskType, status, assignedTo, priority, etaMinutes)
      VALUES (?, ?, ?, ?, 'Full Clean', 'Pending', 'Unassigned', 'Urgent', 45)`)
      .run(uid('hk'), current.roomNumber, current.roomType, parseInt(String(current.roomNumber)[0], 10));
    return { checkedOut: true, balance, roomNightsPosted };
  });
  if (!result.checkedOut) {
    return res.status(409).json({
      error: `Folio balance must be zero before checkout (${result.balance.toFixed(2)})`,
      roomNightsPosted: result.roomNightsPosted,
    });
  }
  sendReservation(res, rez.id);
});

r.post('/reservations/:id/folio-items', requireFolioRole, (req, res) => {
  const rez = getReservation(req.params.id);
  if (!rez) return res.status(404).json({ error: 'Reservation not found' });
  if (!['Confirmed', 'Checked-In'].includes(rez.status)) {
    return res.status(409).json({ error: `The ${rez.status} reservation folio is closed` });
  }
  const { description, category, amount } = req.body || {};
  const normalizedDescription = typeof description === 'string' ? description.trim() : '';
  if (!normalizedDescription || !isFiniteNumber(amount) || Math.abs(amount) < 0.005) {
    return res.status(400).json({ error: 'description and a non-zero finite numeric amount are required' });
  }
  if (!MANUAL_FOLIO_CATEGORIES.has(category)) {
    return res.status(400).json({ error: 'Unsupported manual folio category' });
  }
  if (amount < 0 && category !== 'Payment') {
    return res.status(400).json({ error: 'Only Payment entries may use a negative amount' });
  }
  const normalizedCategory = category;
  const normalizedAmount = toMoney(amount);
  if (!isFiniteNumber(normalizedAmount) || Math.abs(normalizedAmount) < 0.005) {
    return res.status(400).json({ error: 'amount is outside the supported currency range' });
  }
  tx(() => {
    if (normalizedCategory === 'Payment') {
      const current = getReservation(rez.id);
      const projectedBalance = projectedFolioBalance(current);
      if (normalizedAmount > 0
        && (projectedBalance >= -0.005 || normalizedAmount > Math.abs(projectedBalance) + 0.005)) {
        throw routeError(409, 'Refund cannot exceed the credit remaining after contracted room charges');
      }
      if (normalizedAmount < 0
        && (projectedBalance <= 0.005 || Math.abs(normalizedAmount) > projectedBalance + 0.005)) {
        throw routeError(409, 'Payment cannot exceed the balance including contracted room charges');
      }
    }
    const folioItemId = uid('f');
    db.prepare('INSERT INTO folio_items (id, reservation_id, date, description, category, amount, postedBy) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(folioItemId, rez.id, today(), normalizedDescription, normalizedCategory, normalizedAmount, req.user.name);
    if (normalizedCategory === 'Payment') {
      db.prepare('UPDATE reservations SET paidAmount = MAX(0, paidAmount - ?) WHERE id = ?')
        .run(normalizedAmount, rez.id);
    }
    postFolioJournal({
      folioItemId,
      date: today(),
      description: `${normalizedDescription} (${rez.guestName}, room ${rez.roomNumber})`,
      source: 'Guest Folio',
      category: normalizedCategory,
      amount: normalizedAmount,
    });
  });
  sendReservation(res, rez.id);
});

// ------------------------------------------------------------ housekeeping ----
r.get('/housekeeping', (req, res) => {
  res.json(db.prepare('SELECT * FROM housekeeping_tasks ORDER BY floor, roomNumber').all());
});

r.patch('/housekeeping/:id', requireOperationsRole, (req, res) => {
  const task = db.prepare('SELECT * FROM housekeeping_tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  const { status, assignedTo, priority, etaMinutes } = req.body || {};
  if (status != null && !HOUSEKEEPING_STATUSES.has(status)) {
    return res.status(400).json({ error: `Unsupported housekeeping status: ${status}` });
  }
  if (priority != null && !HOUSEKEEPING_PRIORITIES.has(priority)) {
    return res.status(400).json({ error: `Unsupported housekeeping priority: ${priority}` });
  }
  if (etaMinutes != null && (!Number.isInteger(etaMinutes) || etaMinutes < 0)) {
    return res.status(400).json({ error: 'etaMinutes must be a non-negative integer' });
  }
  if (assignedTo != null && (typeof assignedTo !== 'string' || !assignedTo.trim())) {
    return res.status(400).json({ error: 'assignedTo must be a non-empty string' });
  }
  tx(() => {
    db.prepare(`UPDATE housekeeping_tasks SET
      status = COALESCE(?, status), assignedTo = COALESCE(?, assignedTo),
      priority = COALESCE(?, priority), etaMinutes = COALESCE(?, etaMinutes) WHERE id = ?`)
      .run(status ?? null, assignedTo ?? null, priority ?? null, etaMinutes ?? null, task.id);
    if (status === 'Completed' && task.taskType !== 'Maintenance Inspect') {
      // A clean can only release a dirty, unoccupied room. In particular, do
      // not make maintenance, out-of-service, reserved, or occupied inventory
      // sellable because a housekeeping task happened to finish.
      db.prepare("UPDATE rooms SET status = 'Vacant Clean', status_since = ? WHERE number = ? AND status = 'Vacant Dirty'")
        .run(today(), task.roomNumber);
    }
  });
  res.json(db.prepare('SELECT * FROM housekeeping_tasks WHERE id = ?').get(task.id));
});

// ------------------------------------------------------------- maintenance ----
r.get('/maintenance', (req, res) => {
  res.json(db.prepare('SELECT * FROM maintenance_orders ORDER BY reportedTime DESC').all().map(serializeMaintenance));
});

r.post('/maintenance', requireOperationsRole, (req, res) => {
  const b = req.body || {};
  const requestId = typeof b.requestId === 'string' ? b.requestId.trim() : '';
  if (b.requestId != null
    && !/^maint-client-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return res.status(400).json({ error: 'requestId must be a maint-client UUID' });
  }
  const roomNumber = b.roomNumber == null ? '' : String(b.roomNumber).trim();
  const issueDescription = typeof b.issueDescription === 'string' ? b.issueDescription.trim() : '';
  if (!roomNumber || !issueDescription) {
    return res.status(400).json({ error: 'roomNumber and issueDescription are required' });
  }
  if (!getRoom(roomNumber)) return res.status(404).json({ error: 'Room not found' });
  if (b.category != null && !MAINTENANCE_CATEGORIES.has(b.category)) {
    return res.status(400).json({ error: `Unsupported maintenance category: ${b.category}` });
  }
  if (b.priority != null && !MAINTENANCE_PRIORITIES.has(b.priority)) {
    return res.status(400).json({ error: `Unsupported maintenance priority: ${b.priority}` });
  }
  if (b.slaMinutes != null && (!Number.isInteger(b.slaMinutes) || b.slaMinutes <= 0)) {
    return res.status(400).json({ error: 'slaMinutes must be a positive integer' });
  }
  if (requestId) {
    const existing = db.prepare('SELECT * FROM maintenance_orders WHERE id = ?').get(requestId);
    if (existing) {
      const sameRequest = existing.roomNumber === roomNumber
        && existing.issueDescription === issueDescription
        && existing.category === (b.category || 'Plumbing')
        && existing.priority === (b.priority || 'Normal')
        && !!existing.safetyCritical === (b.safetyCritical === true);
      if (!sameRequest) {
        return res.status(409).json({ error: 'requestId was already used for a different maintenance ticket' });
      }
      return res.json({ ...serializeMaintenance(existing), deduplicated: true });
    }
  }
  const id = requestId || uid('maint');
  if (b.safetyCritical != null && typeof b.safetyCritical !== 'boolean') {
    return res.status(400).json({ error: 'safetyCritical must be a boolean' });
  }
  tx(() => {
    db.prepare(`INSERT INTO maintenance_orders (id, roomNumber, issueDescription, category, priority, status, reportedBy, assignedEngineer, slaMinutes, reportedTime, safetyCritical)
      VALUES (?, ?, ?, ?, ?, 'Open', ?, ?, ?, ?, ?)`).run(
      id, roomNumber, issueDescription, b.category || 'Plumbing',
      b.priority || 'Normal', req.user.name,
      b.assignedEngineer || 'Unassigned', b.slaMinutes || 120,
      new Date().toTimeString().slice(0, 5), b.safetyCritical ? 1 : 0
    );
    enqueueWebhookEvent('maintenance.created', {
      id,
      roomNumber,
      category: b.category || 'Plumbing',
      priority: b.priority || 'Normal',
      status: 'Open',
      safetyCritical: b.safetyCritical === true,
    }, { database: db, requestId: req.id, manageTransaction: false });
    if (b.safetyCritical === true) {
      enqueueWorkflowEvent('maintenance.safety-reported', id, {
        roomNumber,
        note: issueDescription,
        category: b.category || 'Plumbing',
        priority: b.priority || 'Normal',
      }, {
        eventVersion: '1',
        actor: req.user.email,
        manageTransaction: false,
      });
    }
  });
  const createdOrder = db.prepare('SELECT * FROM maintenance_orders WHERE id = ?').get(id);
  if (b.safetyCritical === true) {
    try {
      processWorkflowEventOutbox({ limit: 10 });
    } catch (error) {
      console.error('[workflow] unable to process maintenance.safety-reported outbox', error);
    }
  }
  res.status(201).json(serializeMaintenance(createdOrder));
});

r.patch('/maintenance/:id/resolve', requireOperationsRole, (req, res) => {
  const order = db.prepare('SELECT * FROM maintenance_orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Work order not found' });
  db.prepare("UPDATE maintenance_orders SET status = 'Resolved' WHERE id = ?").run(order.id);
  res.json(serializeMaintenance(db.prepare('SELECT * FROM maintenance_orders WHERE id = ?').get(order.id)));
});

// ----------------------------------------------------------------- guests ----
r.get('/guests', requireFolioRole, (req, res) => {
  res.json(db.prepare('SELECT * FROM guest_profiles ORDER BY lifetimeSpend DESC').all().map(serializeGuest));
});

r.get('/guests/:id', requireFolioRole, (req, res) => {
  const guest = db.prepare('SELECT * FROM guest_profiles WHERE id = ?').get(req.params.id);
  if (!guest) return res.status(404).json({ error: 'Guest not found' });
  res.json(serializeGuest(guest));
});

// ------------------------------------------------------------- pos charges ----
r.get('/pos-charges', requireFolioRole, (req, res) => {
  res.json(db.prepare('SELECT * FROM pos_charges ORDER BY time DESC').all().map(serializePosCharge));
});

r.post('/pos-charges', requireFrontOfficeRole, (req, res) => {
  const b = req.body || {};
  const requestId = typeof b.requestId === 'string' ? b.requestId.trim() : '';
  if (b.requestId != null
    && !/^pos-client-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return res.status(400).json({ error: 'requestId must be a pos-client UUID' });
  }
  if (!b.roomNumber || !b.outlet || !Array.isArray(b.items) || b.items.length === 0) {
    return res.status(400).json({ error: 'roomNumber, outlet and items[] are required' });
  }
  if (!POS_OUTLETS.has(b.outlet)) {
    return res.status(400).json({ error: 'Unsupported POS outlet' });
  }
  const items = [];
  for (let index = 0; index < b.items.length; index++) {
    const item = b.items[index];
    const name = item && typeof item.name === 'string' ? item.name.trim() : '';
    if (!name || !isFiniteNumber(item?.price) || item.price <= 0
      || !Number.isInteger(item?.qty) || item.qty <= 0) {
      return res.status(400).json({
        error: `items[${index}] requires a name, positive finite price, and positive integer qty`,
      });
    }
    items.push({ name, price: item.price, qty: item.qty });
  }
  const computedTotal = +items.reduce((sum, item) => sum + item.price * item.qty, 0).toFixed(2);
  if (!Number.isFinite(computedTotal)) {
    return res.status(400).json({ error: 'POS total is outside the supported numeric range' });
  }
  if (b.total != null && (!isFiniteNumber(b.total) || Math.abs(b.total - computedTotal) > 0.005)) {
    return res.status(400).json({ error: `total must equal the item total (${computedTotal.toFixed(2)})` });
  }
  const total = computedTotal;
  if (requestId) {
    const existing = db.prepare('SELECT * FROM pos_charges WHERE id = ?').get(requestId);
    if (existing) {
      const serialized = serializePosCharge(existing);
      const sameRequest = serialized.roomNumber === String(b.roomNumber)
        && serialized.outlet === b.outlet
        && Math.abs(serialized.total - total) <= 0.005
        && JSON.stringify(serialized.items) === JSON.stringify(items);
      if (!sameRequest) {
        return res.status(409).json({ error: 'requestId was already used for a different POS transaction' });
      }
      return res.json({ charge: serialized, folioItemPosted: true, deduplicated: true });
    }
  }
  const rez = db.prepare("SELECT * FROM reservations WHERE roomNumber = ? AND status = 'Checked-In'").get(b.roomNumber);
  if (!getRoom(b.roomNumber)) return res.status(404).json({ error: 'Room not found' });
  if (!rez) {
    return res.status(409).json({ error: `Room ${b.roomNumber} has no checked-in reservation to receive this charge` });
  }
  const id = requestId || uid('pos');
  const result = tx(() => {
    db.prepare('INSERT INTO pos_charges (id, time, roomNumber, guestName, outlet, items, total, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, b.time || new Date().toTimeString().slice(0, 5), b.roomNumber,
        rez.guestName, b.outlet, JSON.stringify(items), total, 'Posted to Room');
    const folioItem = uid('f');
    const folioCategory = b.outlet === 'Serenity Spa' ? 'Spa & Wellness' : 'F&B Restaurant';
    db.prepare('INSERT INTO folio_items (id, reservation_id, date, description, category, amount, postedBy) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(folioItem, rez.id, today(), `${b.outlet} - POS Charge`, folioCategory, total, 'POS Terminal');
    postFolioJournal({
      folioItemId: folioItem,
      date: today(),
      description: `${b.outlet} POS charge (${rez.guestName}, room ${rez.roomNumber})`,
      source: 'POS',
      category: folioCategory,
      amount: total,
    });
    return { charge: serializePosCharge(db.prepare('SELECT * FROM pos_charges WHERE id = ?').get(id)), folioItemPosted: true, reservationId: rez.id };
  });
  res.status(201).json(result);
});

// ------------------------------------------------------------ pricing rules ----
r.get('/pricing-rules', requireFinanceRole, (req, res) => {
  res.json(db.prepare('SELECT * FROM pricing_rules ORDER BY baseRate').all().map(serializePricingRule));
});

r.patch('/pricing-rules/:id', requireFinanceRole, (req, res) => {
  const rule = db.prepare('SELECT * FROM pricing_rules WHERE id = ?').get(req.params.id);
  if (!rule) return res.status(404).json({ error: 'Rule not found' });
  const { autoApply } = req.body || {};
  if (autoApply != null) {
    db.prepare('UPDATE pricing_rules SET autoApply = ? WHERE id = ?').run(autoApply ? 1 : 0, rule.id);
  }
  res.json(serializePricingRule(db.prepare('SELECT * FROM pricing_rules WHERE id = ?').get(rule.id)));
});

r.post('/pricing-rules/:id/apply', requireFinanceRole, (req, res) => {
  const rule = db.prepare('SELECT * FROM pricing_rules WHERE id = ?').get(req.params.id);
  if (!rule) return res.status(404).json({ error: 'Rule not found' });
  const updated = tx(() => {
    const result = db.prepare("UPDATE rooms SET currentPrice = ? WHERE type = ? AND status != 'Occupied'")
      .run(rule.recommendedRate, rule.roomType);
    return {
      roomsUpdated: Number(result.changes),
      rooms: db.prepare('SELECT * FROM rooms WHERE type = ? ORDER BY number').all(rule.roomType).map(serializeRoom),
    };
  });
  res.json({ rule: serializePricingRule(rule), ...updated });
});

// ---------------------------------------------------------------- channels ----
r.get('/channels', requireFolioRole, (req, res) => {
  res.json(db.prepare('SELECT * FROM channels ORDER BY name').all().map(serializeChannel));
});

r.post('/channels/sync', requireFrontOfficeRole, (req, res) => {
  const { id } = req.body || {};
  if (id === 'all') {
    db.prepare("UPDATE channels SET lastSync = 'Just now'").run();
  } else {
    const ch = db.prepare('SELECT * FROM channels WHERE id = ?').get(id);
    if (!ch) return res.status(404).json({ error: 'Channel not found (use id or "all")' });
    db.prepare("UPDATE channels SET lastSync = 'Just now' WHERE id = ?").run(id);
  }
  res.json(db.prepare('SELECT * FROM channels ORDER BY name').all().map(serializeChannel));
});

// ----------------------------------------------------------------- metrics ----
r.get('/metrics', (req, res) => {
  const t = today();
  const rooms = db.prepare('SELECT status FROM rooms').all();
  const total = rooms.filter((room) => room.status !== 'Out of Service').length;
  const occupied = rooms.filter((x) => x.status === 'Occupied');
  const occupancyRate = total ? +((occupied.length / total) * 100).toFixed(1) : 0;
  const contractedRates = db.prepare(`
    SELECT totalAmount / nights AS nightlyRate
    FROM reservations
    WHERE status = 'Checked-In' AND nights > 0 AND totalAmount >= 0
  `).all();
  const adr = contractedRates.length
    ? +(contractedRates.reduce((sum, row) => sum + row.nightlyRate, 0) / contractedRates.length).toFixed(2)
    : 0;
  const revPar = +((adr * occupancyRate) / 100).toFixed(2);
  const revenueRow = db.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS rev FROM folio_items WHERE date = ? AND category NOT IN ('Payment','Tax')"
  ).get(t);
  const canViewFinancialMetrics = ['General Manager', 'Finance'].includes(req.user.role);
  res.json({
    businessDate: t,
    occupancyRate,
    financialMetricsAvailable: canViewFinancialMetrics,
    adr: canViewFinancialMetrics ? adr : 0,
    revPar: canViewFinancialMetrics ? revPar : 0,
    totalRevenue: canViewFinancialMetrics ? +revenueRow.rev.toFixed(2) : 0,
    arrivalsToday: db.prepare("SELECT COUNT(*) AS n FROM reservations WHERE checkIn = ? AND status NOT IN ('Cancelled','No-Show')").get(t).n,
    departuresToday: db.prepare(`
      SELECT COUNT(*) AS n FROM reservations
      WHERE (status = 'Checked-Out' AND COALESCE(actualCheckOut, checkOut) = ?)
         OR (status IN ('Confirmed','Checked-In') AND checkOut = ?)
    `).get(t, t).n,
    inHouseGuests: db.prepare("SELECT COALESCE(SUM(guestsCount),0) AS n FROM reservations WHERE status = 'Checked-In'").get().n,
    dirtyRooms: rooms.filter((x) => x.status === 'Vacant Dirty').length,
  });
});

export default r;
