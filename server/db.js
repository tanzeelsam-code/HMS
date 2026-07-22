// db.js — schema + seed for the NexusHOS local backend.
// NOTE: better-sqlite3 could not be installed on this machine (no Visual Studio
// build tools, and upstream ships no prebuilt binaries). We use Node's built-in
// node:sqlite (DatabaseSync), which exposes the same synchronous API style.
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { hashPassword, isPasswordHash } from './passwords.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configuredDbPath = process.env.HMS_DB_PATH?.trim();
export const DB_PATH = configuredDbPath === ':memory:'
  ? configuredDbPath
  : path.resolve(configuredDbPath || path.join(__dirname, 'hms.db'));
export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

export const uid = (prefix) => `${prefix}-${crypto.randomUUID()}`;

// Run fn inside a transaction (node:sqlite has no .transaction() helper).
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export const BUSINESS_TIME_ZONE = process.env.HMS_TIME_ZONE?.trim() || 'Europe/Copenhagen';
const businessDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const today = () => {
  const parts = Object.fromEntries(
    businessDateFormatter.formatToParts(new Date()).map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const addDaysIso = (value, amount) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------- schema ----
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, password TEXT, role TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), created_at TEXT
);
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY, number TEXT UNIQUE, type TEXT, floor INTEGER, status TEXT,
  basePrice REAL, currentPrice REAL, amenities TEXT, currentGuestName TEXT,
  status_since TEXT
);
CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY, code TEXT, guestName TEXT, guestEmail TEXT, guestPhone TEXT,
  vipTier TEXT, roomNumber TEXT, roomType TEXT, checkIn TEXT, checkOut TEXT,
  nights INTEGER, guestsCount INTEGER, status TEXT, channel TEXT,
  totalAmount REAL, paidAmount REAL, specialRequests TEXT,
  contactlessCheckInCompleted INTEGER DEFAULT 0, actualCheckOut TEXT
);
CREATE TABLE IF NOT EXISTS folio_items (
  id TEXT PRIMARY KEY, reservation_id TEXT REFERENCES reservations(id),
  date TEXT, description TEXT, category TEXT, amount REAL, postedBy TEXT
);
CREATE TABLE IF NOT EXISTS housekeeping_tasks (
  id TEXT PRIMARY KEY, roomNumber TEXT, roomType TEXT, floor INTEGER,
  taskType TEXT, status TEXT, assignedTo TEXT, priority TEXT, etaMinutes INTEGER
);
CREATE TABLE IF NOT EXISTS pricing_rules (
  id TEXT PRIMARY KEY, roomType TEXT, baseRate REAL, recommendedRate REAL,
  demandFactor REAL, competitorAvgRate REAL, occupancyTrigger REAL, autoApply INTEGER
);
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY, name TEXT, logo TEXT, connected INTEGER,
  activeListings INTEGER, commissionRate REAL, lastSync TEXT,
  syncLatency TEXT, bookingsThisMonth INTEGER
);
CREATE TABLE IF NOT EXISTS pos_charges (
  id TEXT PRIMARY KEY, time TEXT, roomNumber TEXT, guestName TEXT, outlet TEXT,
  items TEXT, total REAL, status TEXT
);
CREATE TABLE IF NOT EXISTS guest_profiles (
  id TEXT PRIMARY KEY, name TEXT, email TEXT, phone TEXT, vipTier TEXT,
  totalStays INTEGER, totalNights INTEGER, lifetimeSpend REAL,
  preferredRoomType TEXT, dietaryPreferences TEXT, notes TEXT, lastStayDate TEXT
);
CREATE TABLE IF NOT EXISTS maintenance_orders (
  id TEXT PRIMARY KEY, roomNumber TEXT, issueDescription TEXT, category TEXT,
  priority TEXT, status TEXT, reportedBy TEXT, assignedEngineer TEXT,
  slaMinutes INTEGER, reportedTime TEXT, safetyCritical INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS gl_accounts (
  id TEXT PRIMARY KEY, code TEXT, name TEXT, type TEXT
);
CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY, date TEXT, description TEXT, source TEXT
);
CREATE TABLE IF NOT EXISTS journal_lines (
  id TEXT PRIMARY KEY, entry_id TEXT REFERENCES journal_entries(id),
  account_id TEXT REFERENCES gl_accounts(id), debit REAL, credit REAL
);
CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY, name TEXT, category TEXT, unit TEXT,
  onHand REAL, parLevel REAL, costPerUnit REAL
);
CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY, name TEXT, contact TEXT, category TEXT
);
CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY, vendorId TEXT, itemId TEXT, qty REAL, unitCost REAL,
  status TEXT, orderDate TEXT
);
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY, name TEXT, role TEXT, department TEXT, shift TEXT,
  hourlyRate REAL, status TEXT
);
CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY, employeeId TEXT, date TEXT, start TEXT, end TEXT
);
CREATE TABLE IF NOT EXISTS night_audit_postings (
  business_date TEXT NOT NULL,
  reservation_id TEXT NOT NULL REFERENCES reservations(id),
  folio_item_id TEXT NOT NULL UNIQUE REFERENCES folio_items(id),
  journal_entry_id TEXT REFERENCES journal_entries(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (business_date, reservation_id)
);
CREATE TABLE IF NOT EXISTS folio_journal_postings (
  folio_item_id TEXT PRIMARY KEY REFERENCES folio_items(id),
  journal_entry_id TEXT NOT NULL REFERENCES journal_entries(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, timezone TEXT NOT NULL,
  currency TEXT NOT NULL, locale TEXT NOT NULL, total_rooms INTEGER NOT NULL,
  status TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_property_memberships (
  user_id TEXT NOT NULL REFERENCES users(id),
  property_id TEXT NOT NULL REFERENCES properties(id),
  role TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, property_id)
);
CREATE TABLE IF NOT EXISTS property_daily_metrics (
  property_id TEXT NOT NULL REFERENCES properties(id),
  business_date TEXT NOT NULL, occupancy_rate REAL NOT NULL,
  adr REAL NOT NULL, revpar REAL NOT NULL, total_revenue REAL NOT NULL,
  goppar REAL NOT NULL, source TEXT NOT NULL, recorded_at TEXT NOT NULL,
  PRIMARY KEY (property_id, business_date)
);
CREATE TABLE IF NOT EXISTS group_bookings (
  id TEXT PRIMARY KEY, property_id TEXT NOT NULL REFERENCES properties(id),
  group_name TEXT NOT NULL, company_name TEXT NOT NULL,
  contact_person TEXT, contact_email TEXT, rooms_allocated INTEGER NOT NULL,
  rooms_picked_up INTEGER NOT NULL DEFAULT 0, start_date TEXT NOT NULL,
  end_date TEXT NOT NULL, release_date TEXT, status TEXT NOT NULL,
  group_rate REAL NOT NULL, banquet_catering_total REAL NOT NULL DEFAULT 0,
  total_value REAL NOT NULL, created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS group_room_blocks (
  group_booking_id TEXT NOT NULL REFERENCES group_bookings(id) ON DELETE CASCADE,
  room_type TEXT NOT NULL, rooms_allocated INTEGER NOT NULL,
  PRIMARY KEY (group_booking_id, room_type),
  CHECK (rooms_allocated > 0)
);
CREATE TABLE IF NOT EXISTS reputation_reviews (
  id TEXT PRIMARY KEY, property_id TEXT NOT NULL REFERENCES properties(id),
  source TEXT NOT NULL, external_id TEXT, guest_name TEXT NOT NULL,
  rating INTEGER NOT NULL, review_date TEXT NOT NULL, review_text TEXT NOT NULL,
  sentiment TEXT NOT NULL, response_draft TEXT, response_text TEXT,
  responded_by TEXT REFERENCES users(id), responded_at TEXT, imported_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS esg_metrics (
  property_id TEXT NOT NULL REFERENCES properties(id), date TEXT NOT NULL,
  carbon_per_occupied_room_kg REAL NOT NULL, energy_kwh_saved REAL NOT NULL,
  hvac_auto_setbacks_triggered INTEGER NOT NULL,
  water_consumption_liters REAL NOT NULL,
  renewable_energy_percentage REAL NOT NULL,
  source TEXT NOT NULL, recorded_at TEXT NOT NULL,
  PRIMARY KEY (property_id, date)
);
CREATE TABLE IF NOT EXISTS esg_actions (
  id TEXT PRIMARY KEY, property_id TEXT NOT NULL REFERENCES properties(id),
  action_type TEXT NOT NULL, target TEXT NOT NULL, status TEXT NOT NULL,
  requested_by TEXT NOT NULL REFERENCES users(id), requested_at TEXT NOT NULL,
  provider TEXT, executed_at TEXT, result TEXT
);
CREATE INDEX IF NOT EXISTS idx_group_bookings_property_dates
  ON group_bookings(property_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_group_room_blocks_room_type
  ON group_room_blocks(room_type, group_booking_id);
CREATE INDEX IF NOT EXISTS idx_reputation_reviews_property_date
  ON reputation_reviews(property_id, review_date DESC);
`);

// Keep existing local databases compatible with fields added after the first
// demo release. SQLite's CREATE TABLE IF NOT EXISTS does not add new columns.
const reservationColumns = new Set(
  db.prepare('PRAGMA table_info(reservations)').all().map((column) => column.name),
);
if (!reservationColumns.has('actualCheckOut')) {
  db.exec('ALTER TABLE reservations ADD COLUMN actualCheckOut TEXT');
}
const maintenanceColumns = new Set(
  db.prepare('PRAGMA table_info(maintenance_orders)').all().map((column) => column.name),
);
if (!maintenanceColumns.has('safetyCritical')) {
  db.exec('ALTER TABLE maintenance_orders ADD COLUMN safetyCritical INTEGER DEFAULT 0');
}
const userColumns = new Set(
  db.prepare('PRAGMA table_info(users)').all().map((column) => column.name),
);
if (!userColumns.has('active')) {
  db.exec('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
}
if (!userColumns.has('must_change_password')) {
  db.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0');
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_normalized_email ON users(lower(trim(email)))');

// Older databases did not enforce reservation-code uniqueness. Repair any
// pre-existing duplicates before adding the index used by search and Copilot.
const duplicateReservationIds = db.prepare(`
  SELECT id FROM reservations
  WHERE rowid NOT IN (SELECT MIN(rowid) FROM reservations GROUP BY code)
`).all();
const reservationCodeExists = db.prepare('SELECT 1 FROM reservations WHERE code = ?');
const updateReservationCode = db.prepare('UPDATE reservations SET code = ? WHERE id = ?');
for (const reservation of duplicateReservationIds) {
  let replacement;
  do {
    replacement = `GH-${crypto.randomInt(100000, 1000000)}`;
  } while (reservationCodeExists.get(replacement));
  updateReservationCode.run(replacement, reservation.id);
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_code_unique ON reservations(code)');

// Core accounts are schema-level dependencies used by operational postings.
// INSERT OR IGNORE also upgrades databases created by older project versions.
const ensureAccount = db.prepare('INSERT OR IGNORE INTO gl_accounts (id, code, name, type) VALUES (?, ?, ?, ?)');
for (const account of [
  ['gl-1000', '1000', 'Cash', 'Asset'],
  ['gl-1100', '1100', 'AR Guest Ledger', 'Asset'],
  ['gl-1200', '1200', 'Inventory', 'Asset'],
  ['gl-2000', '2000', 'Accounts Payable', 'Liability'],
  ['gl-2100', '2100', 'Taxes Payable', 'Liability'],
  ['gl-3000', '3000', 'Owner Equity', 'Equity'],
  ['gl-4000', '4000', 'Rooms Revenue', 'Revenue'],
  ['gl-4100', '4100', 'F&B Revenue', 'Revenue'],
  ['gl-4200', '4200', 'Other Income', 'Revenue'],
  ['gl-5000', '5000', 'Payroll Expense', 'Expense'],
  ['gl-5100', '5100', 'Supplies Expense', 'Expense'],
  ['gl-5200', '5200', 'Utilities', 'Expense'],
]) ensureAccount.run(...account);

// ------------------------------------------------------------------ seed ----
const count = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;

if (count('users') === 0 && process.env.NODE_ENV !== 'production') {
  tx(() => {
    const ins = (t, cols, rows) => {
      const stmt = db.prepare(
        `INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
      );
      for (const r of rows) stmt.run(...r);
    };

    ins('users', ['id', 'name', 'email', 'password', 'role'], [
      ['u-gm', 'Ava Reyes', 'gm@aura.com', hashPassword('admin123'), 'General Manager'],
      ['u-fd', 'Noah Kim', 'frontdesk@aura.com', hashPassword('front123'), 'Front Desk'],
      ['u-hk', 'Maria Santos', 'house@aura.com', hashPassword('house123'), 'Housekeeping'],
      ['u-fin', 'Omar Farouk', 'finance@aura.com', hashPassword('fin123'), 'Finance'],
    ]);

    ins('rooms', ['id', 'number', 'type', 'floor', 'status', 'basePrice', 'currentPrice', 'amenities', 'currentGuestName', 'status_since'], [
      ['101', '101', 'Standard King', 1, 'Occupied', 180, 220, JSON.stringify(['King Bed', 'City View', 'Wi-Fi 6', 'Rain Shower']), 'Alexander Wright', '2026-07-20'],
      ['102', '102', 'Standard King', 1, 'Vacant Clean', 180, 220, JSON.stringify(['King Bed', 'City View', 'Wi-Fi 6']), null, '2026-07-18'],
      ['103', '103', 'Standard King', 1, 'Vacant Dirty', 180, 210, JSON.stringify(['King Bed', 'Garden Access', 'Smart TV']), null, '2026-07-21'],
      ['104', '104', 'Deluxe Ocean View', 1, 'Occupied', 280, 340, JSON.stringify(['Ocean Balcony', 'Nespresso', 'King Bed']), 'Sophia Martinez', '2026-07-21'],
      ['105', '105', 'Deluxe Ocean View', 1, 'Reserved', 280, 340, JSON.stringify(['Ocean Balcony', 'Nespresso', 'Soaking Tub']), null, '2026-07-21'],
      ['201', '201', 'Deluxe Ocean View', 2, 'Vacant Clean', 290, 350, JSON.stringify(['Private Balcony', 'Ocean View', 'Mini Bar']), null, '2026-07-20'],
      ['202', '202', 'Deluxe Ocean View', 2, 'Vacant Clean', 290, 350, JSON.stringify(['Private Balcony', 'Ocean View']), null, '2026-07-19'],
      ['203', '203', 'Executive Suite', 2, 'Occupied', 450, 560, JSON.stringify(['Lounge Area', 'Free Breakfast', 'Butler Service']), 'Victoria Sterling', '2026-07-21'],
      ['204', '204', 'Executive Suite', 2, 'Vacant Dirty', 450, 560, JSON.stringify(['Jacuzzi', 'Workstation']), null, '2026-07-21'],
      ['205', '205', 'Executive Suite', 2, 'Reserved', 450, 560, JSON.stringify(['Panoramic View']), null, '2026-07-21'],
      ['301', '301', 'Executive Suite', 3, 'Vacant Clean', 480, 580, JSON.stringify(['High Floor', 'Skyline View', 'Espresso Bar']), null, '2026-07-20'],
      ['302', '302', 'Executive Suite', 3, 'Vacant Clean', 480, 580, JSON.stringify(['High Floor', 'Skyline View']), null, '2026-07-19'],
      ['303', '303', 'Presidential Suite', 3, 'Occupied', 1200, 1450, JSON.stringify(['Private Terrace', 'Plunge Pool', 'Personal Chef Access', 'Helipad Access']), 'Elena Rostova', '2026-07-19'],
      ['304', '304', 'Presidential Suite', 3, 'Out of Service', 1200, 1450, JSON.stringify(['Private Terrace', 'Fireplace', 'Grand Piano']), null, '2026-07-17'],
    ]);

    ins('reservations', ['id', 'code', 'guestName', 'guestEmail', 'guestPhone', 'vipTier', 'roomNumber', 'roomType', 'checkIn', 'checkOut', 'nights', 'guestsCount', 'status', 'channel', 'totalAmount', 'paidAmount', 'specialRequests', 'contactlessCheckInCompleted'], [
      ['res-101', 'GH-8821', 'Alexander Wright', 'alex.wright@corp.com', '+1 (555) 234-5678', 'Platinum', '101', 'Standard King', '2026-07-20', '2026-07-24', 4, 2, 'Checked-In', 'Direct Web', 880, 880, 'High floor preferred, extra feather pillows', 1],
      ['res-104', 'GH-9034', 'Sophia Martinez', 'sophia.m@designs.io', '+1 (555) 876-5432', 'Gold', '104', 'Deluxe Ocean View', '2026-07-21', '2026-07-25', 4, 1, 'Checked-In', 'Booking.com', 1360, 680, 'Quiet room away from elevators', 1],
      ['res-203', 'GH-9112', 'Victoria Sterling', 'v.sterling@global.co', '+44 7700 900123', 'Platinum', '203', 'Executive Suite', '2026-07-21', '2026-07-26', 5, 2, 'Checked-In', 'Direct Web', 2800, 2800, 'Airport transfer arranged, VIP welcome champagne in room', 1],
      ['res-105', 'GH-9200', 'Liam Hemsworth', 'liam.h@cinema.org', '+1 (555) 444-9988', 'Silver', '105', 'Deluxe Ocean View', '2026-07-21', '2026-07-23', 2, 2, 'Confirmed', 'Airbnb', 680, 680, 'Late arrival expected around 9:00 PM', 0],
      ['res-303', 'GH-9999', 'Elena Rostova', 'elena.rostova@venture.com', '+33 6 12 34 56 78', 'Platinum', '303', 'Presidential Suite', '2026-07-19', '2026-07-26', 7, 3, 'Checked-In', 'Direct Web', 10150, 10150, 'Private security clearance required for helicopter landing', 1],
    ]);

    ins('folio_items', ['id', 'reservation_id', 'date', 'description', 'category', 'amount', 'postedBy'], [
      ['f-1', 'res-101', '2026-07-20', 'Room Charge (101)', 'Room Charge', 220, 'System Auto'],
      ['f-2', 'res-101', '2026-07-20', 'Occupancy Tax & Resort Fee', 'Tax', 35, 'System Auto'],
      ['f-3', 'res-101', '2026-07-21', 'Savor Dinner - Wagyu & Wine', 'F&B Restaurant', 145, 'POS Terminal 1'],
      ['f-4', 'res-101', '2026-07-20', 'Advance Card Payment', 'Payment', -880, 'Stripe Gateway'],
      ['f-10', 'res-104', '2026-07-21', 'Room Charge (104)', 'Room Charge', 340, 'System Auto'],
      ['f-11', 'res-104', '2026-07-21', 'Serenity Spa - Swedish Massage', 'Spa & Wellness', 180, 'Spa POS'],
      ['f-12', 'res-104', '2026-07-21', 'Deposit Payment', 'Payment', -680, 'Front Desk'],
      ['f-20', 'res-203', '2026-07-21', 'Room Charge (203)', 'Room Charge', 560, 'System Auto'],
      ['f-21', 'res-203', '2026-07-21', 'Full Stay Pre-payment', 'Payment', -2800, 'Direct Engine'],
      ['f-30', 'res-303', '2026-07-19', 'Room Charge (303)', 'Room Charge', 1450, 'System Auto'],
      ['f-31', 'res-303', '2026-07-20', 'Horizon Bar Private Tasting', 'F&B Restaurant', 650, 'Bar POS'],
      ['f-32', 'res-303', '2026-07-19', 'Amex Centurion Payment', 'Payment', -10150, 'System'],
    ]);

    ins('housekeeping_tasks', ['id', 'roomNumber', 'roomType', 'floor', 'taskType', 'status', 'assignedTo', 'priority', 'etaMinutes'], [
      ['hk-1', '103', 'Standard King', 1, 'Full Clean', 'In-Progress', 'Maria Santos', 'High', 15],
      ['hk-2', '204', 'Executive Suite', 2, 'Full Clean', 'Pending', 'Carlos Rivera', 'Urgent', 35],
      ['hk-3', '304', 'Presidential Suite', 3, 'Maintenance Inspect', 'In-Progress', 'Engineering (John D.)', 'Urgent', 45],
      ['hk-4', '102', 'Standard King', 1, 'Touch-up', 'Inspected', 'Anna Kowalski', 'Normal', 0],
    ]);

    ins('pricing_rules', ['id', 'roomType', 'baseRate', 'recommendedRate', 'demandFactor', 'competitorAvgRate', 'occupancyTrigger', 'autoApply'], [
      ['dp-1', 'Standard King', 180, 220, 1.22, 205, 75, 1],
      ['dp-2', 'Deluxe Ocean View', 280, 340, 1.21, 325, 80, 1],
      ['dp-3', 'Executive Suite', 450, 560, 1.24, 540, 85, 0],
      ['dp-4', 'Presidential Suite', 1200, 1450, 1.21, 1400, 90, 0],
    ]);

    ins('channels', ['id', 'name', 'logo', 'connected', 'activeListings', 'commissionRate', 'lastSync', 'syncLatency', 'bookingsThisMonth'], [
      ['ch-1', 'Direct Web', '🌐', 1, 14, 0, '10 seconds ago', '12ms', 84],
      ['ch-2', 'Booking.com', '🏨', 1, 14, 15, '1 min ago', '140ms', 128],
      ['ch-3', 'Airbnb', '🏠', 1, 10, 14, '3 mins ago', '210ms', 42],
      ['ch-4', 'Expedia', '✈️', 1, 14, 18, '5 mins ago', '180ms', 66],
      ['ch-5', 'Agoda', '🌏', 1, 12, 16, '8 mins ago', '320ms', 29],
    ]);

    ins('pos_charges', ['id', 'time', 'roomNumber', 'guestName', 'outlet', 'items', 'total', 'status'], [
      ['pos-101', '20:15 PM', '101', 'Alexander Wright', 'Savor Fine Dining', JSON.stringify([{ name: 'A5 Wagyu Ribeye', price: 95, qty: 1 }, { name: 'Barolo 2018', price: 50, qty: 1 }]), 145, 'Posted to Room'],
      ['pos-102', '19:40 PM', '104', 'Sophia Martinez', 'Serenity Spa', JSON.stringify([{ name: 'Deep Tissue Massage 90m', price: 180, qty: 1 }]), 180, 'Posted to Room'],
      ['pos-103', '18:10 PM', '303', 'Elena Rostova', 'Horizon Lounge & Bar', JSON.stringify([{ name: 'Dom Pérignon 2012', price: 450, qty: 1 }, { name: 'Caviar Service', price: 200, qty: 1 }]), 650, 'Posted to Room'],
    ]);

    ins('guest_profiles', ['id', 'name', 'email', 'phone', 'vipTier', 'totalStays', 'totalNights', 'lifetimeSpend', 'preferredRoomType', 'dietaryPreferences', 'notes', 'lastStayDate'], [
      ['cdp-1', 'Alexander Wright', 'alex.wright@corp.com', '+1 (555) 234-5678', 'Platinum', 8, 26, 8450, 'Standard King', JSON.stringify(['Gluten-Free', 'High Protein', 'Perrier Water']), 'Prefers high floor quiet rooms. Always requests extra feather pillows & late checkout.', '2026-07-20'],
      ['cdp-2', 'Elena Rostova', 'elena.rostova@venture.com', '+33 6 12 34 56 78', 'Platinum', 14, 52, 48900, 'Presidential Suite', JSON.stringify(['Organic Vegan', 'Dom Pérignon 2012']), 'VVIP Ultra High Net Worth guest. Requires private security clearance & direct helipad protocol.', '2026-07-19'],
      ['cdp-3', 'Sophia Martinez', 'sophia.m@designs.io', '+1 (555) 876-5432', 'Gold', 4, 12, 4200, 'Deluxe Ocean View', JSON.stringify(['Oat Milk Latte', 'Fresh Fruit Platter']), 'Design executive. Enjoys Serenity Spa deep tissue massage treatments.', '2026-07-21'],
    ]);

    ins('maintenance_orders', ['id', 'roomNumber', 'issueDescription', 'category', 'priority', 'status', 'reportedBy', 'assignedEngineer', 'slaMinutes', 'reportedTime'], [
      ['maint-304', '304', 'AC HVAC compressor pressure leak & noise vibration in ceiling unit', 'HVAC / AC', 'Urgent', 'In-Progress', 'Housekeeping (Maria S.)', 'John Depta (Lead HVAC Eng)', 45, '14:20 PM'],
      ['maint-103', '103', 'NFC Bluetooth Door lock low battery warning alert (12% remaining)', 'Door Lock', 'High', 'Open', 'System IoT Monitor', 'Alex Tech', 90, '16:05 PM'],
    ]);

    ins('inventory_items', ['id', 'name', 'category', 'unit', 'onHand', 'parLevel', 'costPerUnit'], [
      ['inv-1', 'Bath Towels', 'Housekeeping Supplies', 'pcs', 120, 80, 6.5],
      ['inv-2', 'King Bed Sheets', 'Housekeeping Supplies', 'pcs', 45, 60, 18],
      ['inv-3', 'Toiletries Amenity Kit', 'Housekeeping Supplies', 'kits', 90, 50, 3.2],
      ['inv-4', 'All-Purpose Cleaner', 'Housekeeping Supplies', 'liters', 22, 25, 4.1],
      ['inv-5', 'Espresso Beans', 'F&B Stock', 'kg', 12, 8, 32],
      ['inv-6', 'Fresh Salmon Fillet', 'F&B Stock', 'kg', 6, 10, 28],
      ['inv-7', 'House Red Wine', 'F&B Stock', 'bottles', 48, 36, 14],
      ['inv-8', 'Sparkling Water 750ml', 'F&B Stock', 'bottles', 30, 40, 2.4],
    ]);

    ins('vendors', ['id', 'name', 'contact', 'category'], [
      ['ven-1', 'Harbor Linen Supply', 'orders@harborlinen.com', 'Housekeeping Supplies'],
      ['ven-2', 'CleanPro Chemicals', 'sales@cleanpro.com', 'Housekeeping Supplies'],
      ['ven-3', 'Pacific Fresh Foods', 'hello@pacificfresh.com', 'F&B Stock'],
      ['ven-4', 'Vineyard Direct', 'trade@vineyarddirect.com', 'F&B Stock'],
    ]);

    ins('purchase_orders', ['id', 'vendorId', 'itemId', 'qty', 'unitCost', 'status', 'orderDate'], [
      ['po-1', 'ven-1', 'inv-2', 40, 18, 'Open', '2026-07-20'],
      ['po-2', 'ven-3', 'inv-6', 15, 28, 'Open', '2026-07-21'],
    ]);

    ins('employees', ['id', 'name', 'role', 'department', 'shift', 'hourlyRate', 'status'], [
      ['emp-1', 'Maria Santos', 'Room Attendant', 'Housekeeping', 'Morning', 19.5, 'Active'],
      ['emp-2', 'Carlos Rivera', 'Room Attendant', 'Housekeeping', 'Morning', 19, 'Active'],
      ['emp-3', 'Anna Kowalski', 'Housekeeping Supervisor', 'Housekeeping', 'Day', 24, 'Active'],
      ['emp-4', 'John Depta', 'Lead HVAC Engineer', 'Engineering', 'Day', 32, 'Active'],
      ['emp-5', 'Noah Kim', 'Front Desk Agent', 'Front Office', 'Evening', 21, 'Active'],
      ['emp-6', 'Priya Nair', 'Sous Chef', 'F&B', 'Evening', 27, 'Active'],
    ]);

    ins('shifts', ['id', 'employeeId', 'date', 'start', 'end'], [
      ['sh-1', 'emp-1', '2026-07-21', '07:00', '15:00'],
      ['sh-2', 'emp-2', '2026-07-21', '07:00', '15:00'],
      ['sh-3', 'emp-3', '2026-07-21', '09:00', '17:00'],
      ['sh-4', 'emp-4', '2026-07-21', '09:00', '17:00'],
      ['sh-5', 'emp-5', '2026-07-21', '15:00', '23:00'],
      ['sh-6', 'emp-6', '2026-07-21', '14:00', '22:00'],
    ]);
  });
  console.log('[db] seeded hms.db');
}

// Development portfolio records are seeded independently so older local
// databases gain the organization model. Production never invents customer,
// property, review, ESG, or group data.
if (process.env.NODE_ENV !== 'production') tx(() => {
  const createdAt = new Date().toISOString();
  db.prepare(`INSERT OR IGNORE INTO organizations (id, name, slug, created_at)
    VALUES (?, ?, ?, ?)`).run('org-nexus', 'Nexus Hospitality Group', 'nexus-hospitality', createdAt);

  const insertProperty = db.prepare(`INSERT OR IGNORE INTO properties
    (id, organization_id, code, name, timezone, currency, locale, total_rooms, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const property of [
    ['prop-main', 'NXR', 'Nexus Luxury Resort & Spa', BUSINESS_TIME_ZONE, 'USD', 'en-US', 14],
    ['prop-villas', 'NXV', 'Nexus Boutique Suites & Villas', 'Europe/Copenhagen', 'EUR', 'en-GB', 20],
    ['prop-grand', 'NXG', 'Nexus Grand Executive Hotel', 'Europe/London', 'GBP', 'en-GB', 45],
  ]) {
    insertProperty.run(property[0], 'org-nexus', ...property.slice(1), 'Active', createdAt);
  }

  const insertMembership = db.prepare(`INSERT OR IGNORE INTO user_property_memberships
    (user_id, property_id, role, created_at) VALUES (?, ?, ?, ?)`);
  for (const membership of [
    ['u-gm', 'prop-main', 'General Manager'],
    ['u-gm', 'prop-villas', 'General Manager'],
    ['u-gm', 'prop-grand', 'General Manager'],
    ['u-fin', 'prop-main', 'Finance'],
    ['u-fin', 'prop-villas', 'Finance'],
    ['u-fin', 'prop-grand', 'Finance'],
    ['u-fd', 'prop-main', 'Front Desk'],
    ['u-hk', 'prop-main', 'Housekeeping'],
  ]) {
    if (db.prepare('SELECT 1 FROM users WHERE id = ?').get(membership[0])) {
      insertMembership.run(...membership, createdAt);
    }
  }

  const insertMetric = db.prepare(`INSERT OR IGNORE INTO property_daily_metrics
    (property_id, business_date, occupancy_rate, adr, revpar, total_revenue, goppar, source, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const metric of [
    ['prop-main', 85.7, 384.5, 329.5, 14850, 215.4, 'PMS operational snapshot'],
    ['prop-villas', 92, 450, 414, 24840, 288.1, 'Imported portfolio snapshot'],
    ['prop-grand', 78.4, 260, 203.8, 27513, 142.3, 'Imported portfolio snapshot'],
  ]) insertMetric.run(metric[0], today(), ...metric.slice(1), createdAt);

  const insertGroup = db.prepare(`INSERT OR IGNORE INTO group_bookings
    (id, property_id, group_name, company_name, contact_person, contact_email,
      rooms_allocated, rooms_picked_up, start_date, end_date, release_date, status,
      group_rate, banquet_catering_total, total_value, created_by, created_at, updated_at)
    VALUES (?, 'prop-main', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const portfolioSeedUser = db.prepare(
    "SELECT id FROM users ORDER BY CASE WHEN role = 'General Manager' THEN 0 ELSE 1 END, id LIMIT 1",
  ).get()?.id || null;
  insertGroup.run('grp-1', 'Global AI Summit 2026', 'Apex Innovations Corp', 'David Vance',
    'd.vance@apexinnovations.io', 12, 10, '2026-08-10', '2026-08-15', '2026-07-27',
    'Definite Block', 290, 14500, 31900, portfolioSeedUser, createdAt, createdAt);
  insertGroup.run('grp-2', 'International Cardiology Symposium', 'MedTech Global Forum',
    'Dr. Sarah Jenkins', 's.jenkins@medtechforum.org', 8, 5, '2026-09-01', '2026-09-05',
    '2026-08-18', 'Tentative Hold', 310, 9800, 22200, portfolioSeedUser, createdAt, createdAt);

  const insertReview = db.prepare(`INSERT OR IGNORE INTO reputation_reviews
    (id, property_id, source, external_id, guest_name, rating, review_date, review_text,
      sentiment, response_draft, imported_at)
    VALUES (?, 'prop-main', ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insertReview.run('rev-1', 'Google Reviews', 'google-demo-1', 'Marcus Brody', 5,
    addDaysIso(today(), -1),
    'Exceptional stay! The contactless digital key unlocked Room 303 in seconds. Savor Fine Dining Wagyu steak was 10/10.',
    'Positive',
    'Dear Marcus, thank you for your glowing review. We are delighted that you enjoyed your suite and dinner, and we look forward to welcoming you back.',
    createdAt);
  insertReview.run('rev-2', 'Booking.com', 'booking-demo-2', 'Claire Bennet', 4,
    addDaysIso(today(), -3),
    'Beautiful ocean view and spotless suite. Wi-Fi was fast. Minor wait during afternoon check-in queue.',
    'Neutral',
    'Dear Claire, thank you for sharing your experience. We are thrilled you loved the ocean view and appreciate your feedback about arrival timing.',
    createdAt);

  db.prepare(`INSERT OR IGNORE INTO esg_metrics
    (property_id, date, carbon_per_occupied_room_kg, energy_kwh_saved,
      hvac_auto_setbacks_triggered, water_consumption_liters,
      renewable_energy_percentage, source, recorded_at)
    VALUES ('prop-main', ?, 11.4, 480, 14, 1420, 68, 'Sample meter snapshot', ?)`)
    .run(today(), createdAt);
});

// Preserve idempotency for seeded room charges and when upgrading a database
// that already contains room-night folio rows from an earlier version.
db.exec(`
  INSERT OR IGNORE INTO night_audit_postings
    (business_date, reservation_id, folio_item_id, journal_entry_id, created_at)
  SELECT date, reservation_id, id, NULL, date || 'T00:00:00.000Z'
  FROM folio_items
  WHERE category = 'Room Charge'
`);

// Repair two known ghost occupants from the original demo seed without
// touching rooms that have since acquired a real checked-in reservation.
db.prepare(`
  UPDATE rooms SET status = 'Vacant Clean', currentGuestName = NULL, status_since = ?
  WHERE number = ? AND status = 'Occupied' AND currentGuestName = ?
    AND NOT EXISTS (
      SELECT 1 FROM reservations WHERE roomNumber = rooms.number AND status = 'Checked-In'
    )
`).run(today(), '201', 'David Chen');
db.prepare(`
  UPDATE rooms SET status = 'Vacant Clean', currentGuestName = NULL, status_since = ?
  WHERE number = ? AND status = 'Occupied' AND currentGuestName = ?
    AND NOT EXISTS (
      SELECT 1 FROM reservations WHERE roomNumber = rooms.number AND status = 'Checked-In'
    )
`).run(today(), '301', 'Lord Marcus Vance');

// Existing demo databases stored seed passwords as plaintext. Migrate every
// legacy value atomically on startup; recognized hashes are left untouched.
const legacyUsers = db.prepare('SELECT id, password FROM users').all()
  .filter((user) => typeof user.password === 'string' && !isPasswordHash(user.password));
if (legacyUsers.length > 0) {
  tx(() => {
    const updatePassword = db.prepare('UPDATE users SET password = ? WHERE id = ?');
    for (const user of legacyUsers) {
      updatePassword.run(hashPassword(user.password), user.id);
    }
  });
  console.log(`[db] migrated ${legacyUsers.length} legacy password(s) to scrypt`);
}

// ------------------------------------------------------------- serializers ----
const parseJson = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };

export function serializeRoom(r) {
  if (!r) return r;
  const { status_since, amenities, currentGuestName, ...rest } = r;
  return {
    ...rest,
    amenities: parseJson(amenities, []),
    ...(currentGuestName ? { currentGuestName } : {}),
  };
}

export function serializeReservation(r) {
  if (!r) return r;
  const { actualCheckOut, ...reservation } = r;
  const folioItems = db.prepare(
    'SELECT id, date, description, category, amount, postedBy FROM folio_items WHERE reservation_id = ? ORDER BY date, id'
  ).all(r.id);
  return {
    ...reservation,
    contactlessCheckInCompleted: !!r.contactlessCheckInCompleted,
    folioItems,
    ...(actualCheckOut ? { actualCheckOut } : {}),
    ...(r.specialRequests ? {} : { specialRequests: undefined }),
  };
}

export function serializeChannel(c) {
  return { ...c, connected: !!c.connected };
}

export function serializePosCharge(p) {
  return { ...p, items: parseJson(p.items, []) };
}

export function serializeGuest(g) {
  return { ...g, dietaryPreferences: parseJson(g.dietaryPreferences, []) };
}

export function serializePricingRule(p) {
  return { ...p, autoApply: !!p.autoApply };
}
