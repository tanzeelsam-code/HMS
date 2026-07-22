// routes/erp.js — GL, night audit, inventory/procurement, HR.
import { Router } from 'express';
import { db, tx, uid, today } from '../db.js';

const r = Router();

// --------------------------------------------------------------------- GL ----
r.get('/gl/accounts', (req, res) => {
  res.json(db.prepare('SELECT * FROM gl_accounts ORDER BY code').all());
});

function serializeEntry(e) {
  const lines = db.prepare(`
    SELECT jl.id, jl.account_id AS accountId, ga.code AS accountCode, ga.name AS accountName, jl.debit, jl.credit
    FROM journal_lines jl JOIN gl_accounts ga ON ga.id = jl.account_id
    WHERE jl.entry_id = ?`).all(e.id);
  return { ...e, lines };
}

r.get('/gl/journal-entries', (req, res) => {
  res.json(db.prepare('SELECT * FROM journal_entries ORDER BY date DESC, id DESC').all().map(serializeEntry));
});

r.post('/gl/journal-entries', (req, res) => {
  const { date, description, lines } = req.body || {};
  if (!Array.isArray(lines) || lines.length < 2) {
    return res.status(400).json({ error: 'lines[] with at least 2 lines is required' });
  }
  const debit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const credit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  if (Math.abs(debit - credit) > 0.005) {
    return res.status(400).json({ error: `Journal entry not balanced: debits ${debit} != credits ${credit}` });
  }
  for (const l of lines) {
    if (!db.prepare('SELECT id FROM gl_accounts WHERE id = ?').get(l.accountId)) {
      return res.status(400).json({ error: `Unknown accountId: ${l.accountId}` });
    }
  }
  const id = uid('je');
  tx(() => {
    db.prepare('INSERT INTO journal_entries (id, date, description, source) VALUES (?, ?, ?, ?)')
      .run(id, date || today(), description || 'Manual journal entry', 'Manual');
    for (const l of lines) {
      db.prepare('INSERT INTO journal_lines (id, entry_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)')
        .run(uid('jl'), id, l.accountId, l.debit || 0, l.credit || 0);
    }
  });
  res.status(201).json(serializeEntry(db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(id)));
});

// ------------------------------------------------------------ night audit ----
r.post('/night-audit', (req, res) => {
  const t = today();
  const summary = tx(() => {
    const inHouse = db.prepare(`
      SELECT res.id, res.roomNumber, rm.currentPrice
      FROM reservations res JOIN rooms rm ON rm.number = res.roomNumber
      WHERE res.status = 'Checked-In'`).all();
    let totalRoomRevenue = 0;
    for (const rez of inHouse) {
      db.prepare('INSERT INTO folio_items (id, reservation_id, date, description, category, amount, postedBy) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(uid('f'), rez.id, t, `Room Charge (${rez.roomNumber})`, 'Room Charge', rez.currentPrice, 'Night Audit');
      totalRoomRevenue += rez.currentPrice;
    }
    let journalEntryId = null;
    if (inHouse.length > 0) {
      journalEntryId = uid('je');
      db.prepare('INSERT INTO journal_entries (id, date, description, source) VALUES (?, ?, ?, ?)')
        .run(journalEntryId, t, `Night audit room revenue posting (${inHouse.length} rooms)`, 'Night Audit');
      db.prepare('INSERT INTO journal_lines (id, entry_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)')
        .run(uid('jl'), journalEntryId, 'gl-1100', totalRoomRevenue, 0); // Dr AR Guest Ledger
      db.prepare('INSERT INTO journal_lines (id, entry_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)')
        .run(uid('jl'), journalEntryId, 'gl-4000', 0, totalRoomRevenue); // Cr Rooms Revenue
    }
    return {
      foliosPosted: inHouse.length,
      totalRoomRevenue: +totalRoomRevenue.toFixed(2),
      journalEntryId,
      ranAt: new Date().toISOString(),
    };
  });
  res.json(summary);
});

// --------------------------------------------------------------- inventory ----
r.get('/inventory/items', (req, res) => {
  res.json(db.prepare('SELECT * FROM inventory_items ORDER BY category, name').all());
});

r.post('/inventory/items', (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'name is required' });
  const id = uid('inv');
  db.prepare('INSERT INTO inventory_items (id, name, category, unit, onHand, parLevel, costPerUnit) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, b.name, b.category || 'General', b.unit || 'pcs', b.onHand || 0, b.parLevel || 0, b.costPerUnit || 0);
  res.status(201).json(db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id));
});

r.patch('/inventory/items/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const b = req.body || {};
  db.prepare(`UPDATE inventory_items SET
    name = COALESCE(?, name), category = COALESCE(?, category), unit = COALESCE(?, unit),
    onHand = COALESCE(?, onHand), parLevel = COALESCE(?, parLevel), costPerUnit = COALESCE(?, costPerUnit)
    WHERE id = ?`)
    .run(b.name ?? null, b.category ?? null, b.unit ?? null, b.onHand ?? null, b.parLevel ?? null, b.costPerUnit ?? null, item.id);
  res.json(db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(item.id));
});

r.get('/inventory/low-stock', (req, res) => {
  res.json(db.prepare('SELECT * FROM inventory_items WHERE onHand <= parLevel ORDER BY (onHand - parLevel)').all());
});

// ------------------------------------------------------------- procurement ----
r.get('/procurement/vendors', (req, res) => {
  res.json(db.prepare('SELECT * FROM vendors ORDER BY name').all());
});

r.get('/procurement/purchase-orders', (req, res) => {
  res.json(db.prepare(`
    SELECT po.*, v.name AS vendorName, i.name AS itemName
    FROM purchase_orders po
    JOIN vendors v ON v.id = po.vendorId
    JOIN inventory_items i ON i.id = po.itemId
    ORDER BY po.orderDate DESC`).all());
});

r.post('/procurement/purchase-orders', (req, res) => {
  const b = req.body || {};
  if (!b.vendorId || !b.itemId || !b.qty) {
    return res.status(400).json({ error: 'vendorId, itemId and qty are required' });
  }
  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(b.itemId);
  if (!db.prepare('SELECT id FROM vendors WHERE id = ?').get(b.vendorId)) {
    return res.status(400).json({ error: 'Unknown vendorId' });
  }
  if (!item) return res.status(400).json({ error: 'Unknown itemId' });
  const id = uid('po');
  db.prepare('INSERT INTO purchase_orders (id, vendorId, itemId, qty, unitCost, status, orderDate) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, b.vendorId, b.itemId, b.qty, b.unitCost ?? item.costPerUnit, 'Open', today());
  res.status(201).json(db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id));
});

r.post('/procurement/purchase-orders/:id/receive', (req, res) => {
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
  if (!po) return res.status(404).json({ error: 'Purchase order not found' });
  if (po.status === 'Received') return res.status(409).json({ error: 'PO already received' });
  tx(() => {
    db.prepare("UPDATE purchase_orders SET status = 'Received' WHERE id = ?").run(po.id);
    db.prepare('UPDATE inventory_items SET onHand = onHand + ? WHERE id = ?').run(po.qty, po.itemId);
  });
  res.json({
    purchaseOrder: db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(po.id),
    item: db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(po.itemId),
  });
});

// ---------------------------------------------------------------------- HR ----
r.get('/hr/employees', (req, res) => {
  res.json(db.prepare('SELECT * FROM employees ORDER BY department, name').all());
});

r.post('/hr/employees', (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.role) return res.status(400).json({ error: 'name and role are required' });
  const id = uid('emp');
  db.prepare('INSERT INTO employees (id, name, role, department, shift, hourlyRate, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, b.name, b.role, b.department || 'General', b.shift || 'Day', b.hourlyRate || 0, b.status || 'Active');
  res.status(201).json(db.prepare('SELECT * FROM employees WHERE id = ?').get(id));
});

r.get('/hr/shifts', (req, res) => {
  res.json(db.prepare(`
    SELECT s.*, e.name AS employeeName FROM shifts s
    JOIN employees e ON e.id = s.employeeId ORDER BY s.date, s.start`).all());
});

r.post('/hr/shifts', (req, res) => {
  const b = req.body || {};
  if (!b.employeeId || !b.date || !b.start || !b.end) {
    return res.status(400).json({ error: 'employeeId, date, start and end are required' });
  }
  if (!db.prepare('SELECT id FROM employees WHERE id = ?').get(b.employeeId)) {
    return res.status(400).json({ error: 'Unknown employeeId' });
  }
  const id = uid('sh');
  db.prepare('INSERT INTO shifts (id, employeeId, date, start, end) VALUES (?, ?, ?, ?, ?)')
    .run(id, b.employeeId, b.date, b.start, b.end);
  res.status(201).json(db.prepare('SELECT * FROM shifts WHERE id = ?').get(id));
});

export default r;
