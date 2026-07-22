// routes/erp.js — GL, night audit, inventory/procurement, HR.
import { Router } from 'express';
import { db, tx, uid, today } from '../db.js';
import { requireRoles } from '../auth.js';
import { contractedNightlyRate } from '../stay-pricing.js';

const r = Router();
const requireFinanceRole = requireRoles('General Manager', 'Finance');
const requireGeneralManager = requireRoles('General Manager');
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const EMPLOYEE_STATUSES = new Set(['Active', 'On Leave', 'Terminated']);

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

const isValidTime = (value) => typeof value === 'string'
  && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

function invalidNonNegativeField(source, fields) {
  return fields.find((field) => source[field] != null
    && (!isFiniteNumber(source[field]) || source[field] < 0));
}

// --------------------------------------------------------------------- GL ----
r.get('/gl/accounts', requireFinanceRole, (req, res) => {
  res.json(db.prepare('SELECT * FROM gl_accounts ORDER BY code').all());
});

function serializeEntry(e) {
  const lines = db.prepare(`
    SELECT jl.id, jl.account_id AS accountId, ga.code AS accountCode, ga.name AS accountName, jl.debit, jl.credit
    FROM journal_lines jl JOIN gl_accounts ga ON ga.id = jl.account_id
    WHERE jl.entry_id = ?`).all(e.id);
  return { ...e, lines };
}

r.get('/gl/journal-entries', requireFinanceRole, (req, res) => {
  const asOf = req.query.asOf;
  if (asOf != null && (typeof asOf !== 'string' || !isValidDate(asOf))) {
    return res.status(400).json({ error: 'asOf must be a valid YYYY-MM-DD date' });
  }
  const entries = asOf
    ? db.prepare('SELECT * FROM journal_entries WHERE date <= ? ORDER BY date DESC, id DESC').all(asOf)
    : db.prepare('SELECT * FROM journal_entries ORDER BY date DESC, id DESC').all();
  res.json(entries.map(serializeEntry));
});

r.post('/gl/journal-entries', requireFinanceRole, (req, res) => {
  const { date, description, lines } = req.body || {};
  if (!Array.isArray(lines) || lines.length < 2) {
    return res.status(400).json({ error: 'lines[] with at least 2 lines is required' });
  }
  if (date != null && !isValidDate(date)) {
    return res.status(400).json({ error: 'date must be a valid YYYY-MM-DD date' });
  }
  const normalizedLines = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line || typeof line !== 'object') {
      return res.status(400).json({ error: `lines[${index}] must be an object` });
    }
    const debit = line.debit ?? 0;
    const credit = line.credit ?? 0;
    if (!isFiniteNumber(debit) || !isFiniteNumber(credit) || debit < 0 || credit < 0) {
      return res.status(400).json({ error: `lines[${index}] debit and credit must be finite non-negative numbers` });
    }
    if ((debit > 0) === (credit > 0)) {
      return res.status(400).json({ error: `lines[${index}] must contain exactly one positive debit or credit` });
    }
    normalizedLines.push({ accountId: line.accountId, debit, credit });
  }
  const debit = normalizedLines.reduce((sum, line) => sum + line.debit, 0);
  const credit = normalizedLines.reduce((sum, line) => sum + line.credit, 0);
  if (!Number.isFinite(debit) || !Number.isFinite(credit)) {
    return res.status(400).json({ error: 'Journal totals are outside the supported numeric range' });
  }
  if (Math.abs(debit - credit) > 0.005) {
    return res.status(400).json({ error: `Journal entry not balanced: debits ${debit} != credits ${credit}` });
  }
  for (const l of normalizedLines) {
    if (!db.prepare('SELECT id FROM gl_accounts WHERE id = ?').get(l.accountId)) {
      return res.status(400).json({ error: `Unknown accountId: ${l.accountId}` });
    }
  }
  const id = uid('je');
  tx(() => {
    db.prepare('INSERT INTO journal_entries (id, date, description, source) VALUES (?, ?, ?, ?)')
      .run(id, date || today(), description || 'Manual journal entry', 'Manual');
    for (const l of normalizedLines) {
      db.prepare('INSERT INTO journal_lines (id, entry_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)')
        .run(uid('jl'), id, l.accountId, l.debit, l.credit);
    }
  });
  res.status(201).json(serializeEntry(db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(id)));
});

// ------------------------------------------------------------ night audit ----
r.post('/night-audit', requireFinanceRole, (req, res) => {
  const t = req.body?.businessDate ?? today();
  if (!isValidDate(t)) {
    return res.status(400).json({ error: 'businessDate must be a valid YYYY-MM-DD date' });
  }
  if (t > today()) {
    return res.status(400).json({ error: 'Night Audit cannot run for a future business date' });
  }
  const summary = tx(() => {
    const inHouse = db.prepare(`
      SELECT res.id, res.roomNumber, res.checkIn, res.totalAmount, res.nights
      FROM reservations res JOIN rooms rm ON rm.number = res.roomNumber
      WHERE res.status = 'Checked-In' AND res.checkIn <= ? AND res.checkOut > ?`).all(t, t);
    const pending = [];
    let foliosSkipped = 0;
    for (const rez of inHouse) {
      const alreadyPosted = db.prepare(`
        SELECT 1 FROM night_audit_postings
        WHERE business_date = ? AND reservation_id = ?`).get(t, rez.id);
      if (alreadyPosted) {
        foliosSkipped++;
      } else {
        if (!isFiniteNumber(rez.totalAmount) || rez.totalAmount < 0
          || !Number.isInteger(rez.nights) || rez.nights <= 0) {
          throw new Error(`Reservation ${rez.id} has an invalid contracted stay amount or night count`);
        }
        const nightlyRate = contractedNightlyRate(rez, t);
        if (!isFiniteNumber(nightlyRate) || nightlyRate < 0) {
          throw new Error(`Reservation ${rez.id} has an invalid contracted nightly rate`);
        }
        pending.push({ ...rez, nightlyRate });
      }
    }

    const totalRoomRevenue = +pending.reduce((sum, rez) => sum + rez.nightlyRate, 0).toFixed(2);
    if (!Number.isFinite(totalRoomRevenue)) {
      throw new Error('Night audit room revenue is outside the supported numeric range');
    }
    let journalEntryId = null;
    if (pending.length > 0 && totalRoomRevenue > 0) {
      journalEntryId = uid('je');
      db.prepare('INSERT INTO journal_entries (id, date, description, source) VALUES (?, ?, ?, ?)')
        .run(journalEntryId, t, `Night audit room revenue posting (${pending.length} rooms)`, 'Night Audit');
      db.prepare('INSERT INTO journal_lines (id, entry_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)')
        .run(uid('jl'), journalEntryId, 'gl-1100', totalRoomRevenue, 0); // Dr AR Guest Ledger
      db.prepare('INSERT INTO journal_lines (id, entry_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)')
        .run(uid('jl'), journalEntryId, 'gl-4000', 0, totalRoomRevenue); // Cr Rooms Revenue
    }

    for (const rez of pending) {
      const folioItemId = uid('f');
      db.prepare('INSERT INTO folio_items (id, reservation_id, date, description, category, amount, postedBy) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(folioItemId, rez.id, t, `Room Charge (${rez.roomNumber})`, 'Room Charge', rez.nightlyRate, 'Night Audit');
      db.prepare(`
        INSERT INTO night_audit_postings
          (business_date, reservation_id, folio_item_id, journal_entry_id, created_at)
        VALUES (?, ?, ?, ?, ?)`)
        .run(t, rez.id, folioItemId, journalEntryId, new Date().toISOString());
    }
    return {
      businessDate: t,
      reservationsProcessed: inHouse.length,
      foliosPosted: pending.length,
      foliosSkipped,
      totalRoomRevenue: +totalRoomRevenue.toFixed(2),
      journalEntryId,
      alreadyRan: pending.length === 0 && foliosSkipped > 0,
      ranAt: new Date().toISOString(),
    };
  });
  res.json(summary);
});

// --------------------------------------------------------------- inventory ----
r.get('/inventory/items', requireFinanceRole, (req, res) => {
  res.json(db.prepare('SELECT * FROM inventory_items ORDER BY category, name').all());
});

r.post('/inventory/items', requireFinanceRole, (req, res) => {
  const b = req.body || {};
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name) return res.status(400).json({ error: 'name is required' });
  const invalidField = invalidNonNegativeField(b, ['onHand', 'parLevel', 'costPerUnit']);
  if (invalidField) {
    return res.status(400).json({ error: `${invalidField} must be a finite non-negative number` });
  }
  const id = uid('inv');
  db.prepare('INSERT INTO inventory_items (id, name, category, unit, onHand, parLevel, costPerUnit) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, name, b.category || 'General', b.unit || 'pcs', b.onHand ?? 0, b.parLevel ?? 0, b.costPerUnit ?? 0);
  res.status(201).json(db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id));
});

r.patch('/inventory/items/:id', requireFinanceRole, (req, res) => {
  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const b = req.body || {};
  const invalidField = invalidNonNegativeField(b, ['onHand', 'parLevel', 'costPerUnit']);
  if (invalidField) {
    return res.status(400).json({ error: `${invalidField} must be a finite non-negative number` });
  }
  for (const field of ['name', 'category', 'unit']) {
    if (b[field] != null && (typeof b[field] !== 'string' || !b[field].trim())) {
      return res.status(400).json({ error: `${field} must be a non-empty string` });
    }
  }
  db.prepare(`UPDATE inventory_items SET
    name = COALESCE(?, name), category = COALESCE(?, category), unit = COALESCE(?, unit),
    onHand = COALESCE(?, onHand), parLevel = COALESCE(?, parLevel), costPerUnit = COALESCE(?, costPerUnit)
    WHERE id = ?`)
    .run(b.name ?? null, b.category ?? null, b.unit ?? null, b.onHand ?? null, b.parLevel ?? null, b.costPerUnit ?? null, item.id);
  res.json(db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(item.id));
});

r.get('/inventory/low-stock', requireFinanceRole, (req, res) => {
  res.json(db.prepare('SELECT * FROM inventory_items WHERE onHand <= parLevel ORDER BY (onHand - parLevel)').all());
});

// ------------------------------------------------------------- procurement ----
r.get('/procurement/vendors', requireFinanceRole, (req, res) => {
  res.json(db.prepare('SELECT * FROM vendors ORDER BY name').all());
});

r.get('/procurement/purchase-orders', requireFinanceRole, (req, res) => {
  res.json(db.prepare(`
    SELECT po.*, v.name AS vendorName, i.name AS itemName
    FROM purchase_orders po
    JOIN vendors v ON v.id = po.vendorId
    JOIN inventory_items i ON i.id = po.itemId
    ORDER BY po.orderDate DESC`).all());
});

r.post('/procurement/purchase-orders', requireFinanceRole, (req, res) => {
  const b = req.body || {};
  if (!b.vendorId || !b.itemId || b.qty == null) {
    return res.status(400).json({ error: 'vendorId, itemId and qty are required' });
  }
  if (!isFiniteNumber(b.qty) || b.qty <= 0) {
    return res.status(400).json({ error: 'qty must be a finite number greater than zero' });
  }
  if (b.unitCost != null && (!isFiniteNumber(b.unitCost) || b.unitCost < 0)) {
    return res.status(400).json({ error: 'unitCost must be a finite non-negative number' });
  }
  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(b.itemId);
  if (!db.prepare('SELECT id FROM vendors WHERE id = ?').get(b.vendorId)) {
    return res.status(400).json({ error: 'Unknown vendorId' });
  }
  if (!item) return res.status(400).json({ error: 'Unknown itemId' });
  const unitCost = b.unitCost ?? item.costPerUnit;
  if (!isFiniteNumber(unitCost) || unitCost < 0) {
    return res.status(400).json({ error: 'Inventory item has an invalid default unit cost' });
  }
  const id = uid('po');
  db.prepare('INSERT INTO purchase_orders (id, vendorId, itemId, qty, unitCost, status, orderDate) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, b.vendorId, b.itemId, b.qty, unitCost, 'Open', today());
  res.status(201).json(db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id));
});

r.post('/procurement/purchase-orders/:id/receive', requireFinanceRole, (req, res) => {
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
  if (!po) return res.status(404).json({ error: 'Purchase order not found' });
  if (po.status === 'Received') return res.status(409).json({ error: 'PO already received' });
  if (!isFiniteNumber(po.qty) || po.qty <= 0
    || !isFiniteNumber(po.unitCost) || po.unitCost < 0) {
    return res.status(409).json({ error: 'Purchase order has an invalid quantity or unit cost' });
  }
  const receiptAmount = Math.round(po.qty * po.unitCost * 100) / 100;
  if (!isFiniteNumber(receiptAmount) || receiptAmount < 0) {
    return res.status(409).json({ error: 'Purchase order has an invalid receipt value' });
  }
  const journalEntryId = tx(() => {
    db.prepare("UPDATE purchase_orders SET status = 'Received' WHERE id = ?").run(po.id);
    db.prepare('UPDATE inventory_items SET onHand = onHand + ? WHERE id = ?').run(po.qty, po.itemId);
    if (receiptAmount < 0.005) return null;
    const entryId = uid('je');
    db.prepare('INSERT INTO journal_entries (id, date, description, source) VALUES (?, ?, ?, ?)')
      .run(entryId, today(), `Inventory receipt for purchase order ${po.id}`, 'Procurement Receipt');
    db.prepare('INSERT INTO journal_lines (id, entry_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)')
      .run(uid('jl'), entryId, 'gl-1200', receiptAmount, 0);
    db.prepare('INSERT INTO journal_lines (id, entry_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)')
      .run(uid('jl'), entryId, 'gl-2000', 0, receiptAmount);
    return entryId;
  });
  res.json({
    purchaseOrder: db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(po.id),
    item: db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(po.itemId),
    receiptAmount,
    journalEntryId,
  });
});

// ---------------------------------------------------------------------- HR ----
r.get('/hr/employees', requireGeneralManager, (req, res) => {
  res.json(db.prepare('SELECT * FROM employees ORDER BY department, name').all());
});

r.post('/hr/employees', requireGeneralManager, (req, res) => {
  const b = req.body || {};
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const role = typeof b.role === 'string' ? b.role.trim() : '';
  if (!name || !role) return res.status(400).json({ error: 'name and role are required' });
  const hourlyRate = b.hourlyRate ?? 0;
  if (!isFiniteNumber(hourlyRate) || hourlyRate < 0) {
    return res.status(400).json({ error: 'hourlyRate must be a finite non-negative number' });
  }
  const status = b.status ?? 'Active';
  if (!EMPLOYEE_STATUSES.has(status)) {
    return res.status(400).json({ error: `Unsupported employee status: ${status}` });
  }
  const id = uid('emp');
  db.prepare('INSERT INTO employees (id, name, role, department, shift, hourlyRate, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, name, role, b.department || 'General', b.shift || 'Day', hourlyRate, status);
  res.status(201).json(db.prepare('SELECT * FROM employees WHERE id = ?').get(id));
});

r.get('/hr/shifts', requireGeneralManager, (req, res) => {
  res.json(db.prepare(`
    SELECT s.*, e.name AS employeeName FROM shifts s
    JOIN employees e ON e.id = s.employeeId ORDER BY s.date, s.start`).all());
});

r.post('/hr/shifts', requireGeneralManager, (req, res) => {
  const b = req.body || {};
  if (!b.employeeId || !b.date || !b.start || !b.end) {
    return res.status(400).json({ error: 'employeeId, date, start and end are required' });
  }
  if (!db.prepare('SELECT id FROM employees WHERE id = ?').get(b.employeeId)) {
    return res.status(400).json({ error: 'Unknown employeeId' });
  }
  if (!isValidDate(b.date)) return res.status(400).json({ error: 'date must be a valid YYYY-MM-DD date' });
  if (!isValidTime(b.start) || !isValidTime(b.end)) {
    return res.status(400).json({ error: 'start and end must use 24-hour HH:MM format' });
  }
  const id = uid('sh');
  db.prepare('INSERT INTO shifts (id, employeeId, date, start, end) VALUES (?, ?, ?, ?, ?)')
    .run(id, b.employeeId, b.date, b.start, b.end);
  res.status(201).json(db.prepare('SELECT * FROM shifts WHERE id = ?').get(id));
});

export default r;
