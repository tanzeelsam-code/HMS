// routes/core.js — rooms, reservations, housekeeping, maintenance, guests,
// POS, pricing rules, channels, metrics.
import { Router } from 'express';
import {
  db, tx, uid, today,
  serializeRoom, serializeReservation, serializeChannel,
  serializePosCharge, serializeGuest, serializePricingRule,
} from '../db.js';

const r = Router();
const getRoom = (number) => db.prepare('SELECT * FROM rooms WHERE number = ?').get(number);
const getReservation = (id) => db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
const sendReservation = (res, id) => res.json(serializeReservation(getReservation(id)));

// ------------------------------------------------------------------ rooms ----
r.get('/rooms', (req, res) => {
  res.json(db.prepare('SELECT * FROM rooms ORDER BY number').all().map(serializeRoom));
});

r.patch('/rooms/:number', (req, res) => {
  const room = getRoom(req.params.number);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const { status, currentPrice } = req.body || {};
  db.prepare('UPDATE rooms SET status = COALESCE(?, status), currentPrice = COALESCE(?, currentPrice), status_since = CASE WHEN ? IS NOT NULL THEN ? ELSE status_since END WHERE number = ?')
    .run(status ?? null, currentPrice ?? null, status ?? null, today(), req.params.number);
  res.json(serializeRoom(getRoom(req.params.number)));
});

// ------------------------------------------------------------ reservations ----
r.get('/reservations', (req, res) => {
  res.json(db.prepare('SELECT * FROM reservations ORDER BY roomNumber').all().map(serializeReservation));
});

r.post('/reservations', (req, res) => {
  const b = req.body || {};
  if (!b.guestName || !b.roomNumber || !b.checkIn || !b.checkOut) {
    return res.status(400).json({ error: 'guestName, roomNumber, checkIn, checkOut are required' });
  }
  const room = getRoom(b.roomNumber);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const id = uid('res');
  const nights = Math.max(1, Math.round((new Date(b.checkOut) - new Date(b.checkIn)) / 86400000));
  tx(() => {
    db.prepare(`INSERT INTO reservations (id, code, guestName, guestEmail, guestPhone, vipTier, roomNumber, roomType,
      checkIn, checkOut, nights, guestsCount, status, channel, totalAmount, paidAmount, specialRequests, contactlessCheckInCompleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, b.code || `GH-${Math.floor(1000 + Math.random() * 9000)}`,
      b.guestName, b.guestEmail || '', b.guestPhone || '', b.vipTier || 'Member',
      b.roomNumber, b.roomType || room.type, b.checkIn, b.checkOut, nights,
      b.guestsCount || 1, b.status || 'Confirmed', b.channel || 'Direct Web',
      b.totalAmount ?? room.currentPrice * nights, b.paidAmount || 0,
      b.specialRequests || null, b.contactlessCheckInCompleted ? 1 : 0
    );
  });
  res.status(201).json(serializeReservation(getReservation(id)));
});

r.post('/reservations/:id/check-in', (req, res) => {
  const rez = getReservation(req.params.id);
  if (!rez) return res.status(404).json({ error: 'Reservation not found' });
  if (rez.status === 'Checked-In') return res.status(409).json({ error: 'Already checked in' });
  tx(() => {
    db.prepare("UPDATE reservations SET status = 'Checked-In' WHERE id = ?").run(rez.id);
    db.prepare("UPDATE rooms SET status = 'Occupied', currentGuestName = ?, status_since = ? WHERE number = ?")
      .run(rez.guestName, today(), rez.roomNumber);
  });
  sendReservation(res, rez.id);
});

r.post('/reservations/:id/check-out', (req, res) => {
  const rez = getReservation(req.params.id);
  if (!rez) return res.status(404).json({ error: 'Reservation not found' });
  if (rez.status !== 'Checked-In') return res.status(409).json({ error: 'Reservation is not Checked-In' });
  tx(() => {
    db.prepare("UPDATE reservations SET status = 'Checked-Out' WHERE id = ?").run(rez.id);
    db.prepare("UPDATE rooms SET status = 'Vacant Dirty', currentGuestName = NULL, status_since = ? WHERE number = ?")
      .run(today(), rez.roomNumber);
    db.prepare(`INSERT INTO housekeeping_tasks (id, roomNumber, roomType, floor, taskType, status, assignedTo, priority, etaMinutes)
      VALUES (?, ?, ?, ?, 'Full Clean', 'Pending', 'Unassigned', 'Urgent', 45)`)
      .run(uid('hk'), rez.roomNumber, rez.roomType, parseInt(String(rez.roomNumber)[0], 10));
  });
  sendReservation(res, rez.id);
});

r.post('/reservations/:id/folio-items', (req, res) => {
  const rez = getReservation(req.params.id);
  if (!rez) return res.status(404).json({ error: 'Reservation not found' });
  const { description, category, amount, postedBy } = req.body || {};
  if (!description || amount == null) return res.status(400).json({ error: 'description and amount are required' });
  db.prepare('INSERT INTO folio_items (id, reservation_id, date, description, category, amount, postedBy) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(uid('f'), rez.id, today(), description, category || 'Other Income', amount, postedBy || 'Front Desk');
  sendReservation(res, rez.id);
});

// ------------------------------------------------------------ housekeeping ----
r.get('/housekeeping', (req, res) => {
  res.json(db.prepare('SELECT * FROM housekeeping_tasks ORDER BY floor, roomNumber').all());
});

r.patch('/housekeeping/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM housekeeping_tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  const { status, assignedTo, priority, etaMinutes } = req.body || {};
  tx(() => {
    db.prepare(`UPDATE housekeeping_tasks SET
      status = COALESCE(?, status), assignedTo = COALESCE(?, assignedTo),
      priority = COALESCE(?, priority), etaMinutes = COALESCE(?, etaMinutes) WHERE id = ?`)
      .run(status ?? null, assignedTo ?? null, priority ?? null, etaMinutes ?? null, task.id);
    if (status === 'Completed') {
      db.prepare("UPDATE rooms SET status = 'Vacant Clean', status_since = ? WHERE number = ?")
        .run(today(), task.roomNumber);
    }
  });
  res.json(db.prepare('SELECT * FROM housekeeping_tasks WHERE id = ?').get(task.id));
});

// ------------------------------------------------------------- maintenance ----
r.get('/maintenance', (req, res) => {
  res.json(db.prepare('SELECT * FROM maintenance_orders ORDER BY reportedTime DESC').all());
});

r.post('/maintenance', (req, res) => {
  const b = req.body || {};
  if (!b.roomNumber || !b.issueDescription) {
    return res.status(400).json({ error: 'roomNumber and issueDescription are required' });
  }
  const id = uid('maint');
  db.prepare(`INSERT INTO maintenance_orders (id, roomNumber, issueDescription, category, priority, status, reportedBy, assignedEngineer, slaMinutes, reportedTime)
    VALUES (?, ?, ?, ?, ?, 'Open', ?, ?, ?, ?)`).run(
    id, b.roomNumber, b.issueDescription, b.category || 'Plumbing',
    b.priority || 'Normal', b.reportedBy || 'Front Desk',
    b.assignedEngineer || 'Unassigned', b.slaMinutes || 120,
    b.reportedTime || new Date().toTimeString().slice(0, 5)
  );
  res.status(201).json(db.prepare('SELECT * FROM maintenance_orders WHERE id = ?').get(id));
});

r.patch('/maintenance/:id/resolve', (req, res) => {
  const order = db.prepare('SELECT * FROM maintenance_orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Work order not found' });
  db.prepare("UPDATE maintenance_orders SET status = 'Resolved' WHERE id = ?").run(order.id);
  res.json(db.prepare('SELECT * FROM maintenance_orders WHERE id = ?').get(order.id));
});

// ----------------------------------------------------------------- guests ----
r.get('/guests', (req, res) => {
  res.json(db.prepare('SELECT * FROM guest_profiles ORDER BY lifetimeSpend DESC').all().map(serializeGuest));
});

r.get('/guests/:id', (req, res) => {
  const guest = db.prepare('SELECT * FROM guest_profiles WHERE id = ?').get(req.params.id);
  if (!guest) return res.status(404).json({ error: 'Guest not found' });
  res.json(serializeGuest(guest));
});

// ------------------------------------------------------------- pos charges ----
r.get('/pos-charges', (req, res) => {
  res.json(db.prepare('SELECT * FROM pos_charges ORDER BY time DESC').all().map(serializePosCharge));
});

r.post('/pos-charges', (req, res) => {
  const b = req.body || {};
  if (!b.roomNumber || !b.outlet || !Array.isArray(b.items) || b.items.length === 0) {
    return res.status(400).json({ error: 'roomNumber, outlet and items[] are required' });
  }
  const total = b.total ?? b.items.reduce((s, i) => s + i.price * (i.qty || 1), 0);
  const rez = db.prepare("SELECT * FROM reservations WHERE roomNumber = ? AND status = 'Checked-In'").get(b.roomNumber);
  const id = uid('pos');
  const result = tx(() => {
    db.prepare('INSERT INTO pos_charges (id, time, roomNumber, guestName, outlet, items, total, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, b.time || new Date().toTimeString().slice(0, 5), b.roomNumber,
        rez ? rez.guestName : (b.guestName || 'Walk-in'), b.outlet,
        JSON.stringify(b.items), total, rez ? 'Posted to Room' : 'Pending');
    let folioItem = null;
    if (rez) {
      folioItem = uid('f');
      db.prepare('INSERT INTO folio_items (id, reservation_id, date, description, category, amount, postedBy) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(folioItem, rez.id, today(), `${b.outlet} - POS Charge`, 'F&B Restaurant', total, 'POS Terminal');
    }
    return { charge: serializePosCharge(db.prepare('SELECT * FROM pos_charges WHERE id = ?').get(id)), folioItemPosted: !!folioItem, reservationId: rez?.id || null };
  });
  res.status(201).json(result);
});

// ------------------------------------------------------------ pricing rules ----
r.get('/pricing-rules', (req, res) => {
  res.json(db.prepare('SELECT * FROM pricing_rules ORDER BY baseRate').all().map(serializePricingRule));
});

r.patch('/pricing-rules/:id', (req, res) => {
  const rule = db.prepare('SELECT * FROM pricing_rules WHERE id = ?').get(req.params.id);
  if (!rule) return res.status(404).json({ error: 'Rule not found' });
  const { autoApply } = req.body || {};
  if (autoApply != null) {
    db.prepare('UPDATE pricing_rules SET autoApply = ? WHERE id = ?').run(autoApply ? 1 : 0, rule.id);
  }
  res.json(serializePricingRule(db.prepare('SELECT * FROM pricing_rules WHERE id = ?').get(rule.id)));
});

r.post('/pricing-rules/:id/apply', (req, res) => {
  const rule = db.prepare('SELECT * FROM pricing_rules WHERE id = ?').get(req.params.id);
  if (!rule) return res.status(404).json({ error: 'Rule not found' });
  const updated = tx(() => {
    db.prepare('UPDATE rooms SET currentPrice = ? WHERE type = ?').run(rule.recommendedRate, rule.roomType);
    return db.prepare('SELECT * FROM rooms WHERE type = ? ORDER BY number').all().map(serializeRoom);
  });
  res.json({ rule: serializePricingRule(rule), roomsUpdated: updated.length, rooms: updated });
});

// ---------------------------------------------------------------- channels ----
r.get('/channels', (req, res) => {
  res.json(db.prepare('SELECT * FROM channels ORDER BY name').all().map(serializeChannel));
});

r.post('/channels/sync', (req, res) => {
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
  const rooms = db.prepare('SELECT status, currentPrice FROM rooms').all();
  const total = rooms.length;
  const occupied = rooms.filter((x) => x.status === 'Occupied');
  const occupancyRate = total ? +((occupied.length / total) * 100).toFixed(1) : 0;
  const adr = occupied.length
    ? +(occupied.reduce((s, x) => s + x.currentPrice, 0) / occupied.length).toFixed(2)
    : 0;
  const revPar = +((adr * occupancyRate) / 100).toFixed(2);
  const revenueRow = db.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS rev FROM folio_items WHERE date = ? AND category != 'Payment'"
  ).get(t);
  res.json({
    occupancyRate,
    adr,
    revPar,
    totalRevenue: +revenueRow.rev.toFixed(2),
    arrivalsToday: db.prepare("SELECT COUNT(*) AS n FROM reservations WHERE checkIn = ? AND status NOT IN ('Cancelled','No-Show')").get(t).n,
    departuresToday: db.prepare("SELECT COUNT(*) AS n FROM reservations WHERE checkOut = ? AND status NOT IN ('Cancelled','No-Show')").get(t).n,
    inHouseGuests: db.prepare("SELECT COALESCE(SUM(guestsCount),0) AS n FROM reservations WHERE status = 'Checked-In'").get().n,
    dirtyRooms: rooms.filter((x) => x.status === 'Vacant Dirty').length,
  });
});

export default r;
