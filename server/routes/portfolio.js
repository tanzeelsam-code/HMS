// Portfolio, groups, reputation, and ESG records that were previously local UI samples.
import { Router } from 'express';
import { db, today, tx, uid } from '../db.js';
import { requireRoles } from '../auth.js';
import { toMoney } from '../accounting.js';
import { enqueueWebhookEvent } from '../webhooks.js';
import {
  ACTIVE_GROUP_STATUSES,
  planGroupRoomTypeAllocation,
  replaceGroupRoomTypeAllocations,
} from '../inventory.js';

const r = Router();
const requirePortfolioRole = requireRoles('General Manager', 'Finance');
const requireCommercialRole = requireRoles('General Manager', 'Front Desk');
const requireGeneralManager = requireRoles('General Manager');
const GROUP_STATUSES = new Set([...ACTIVE_GROUP_STATUSES, 'Released', 'Cancelled']);
const ACTIVE_GROUP_STATUS_SET = new Set(ACTIVE_GROUP_STATUSES);
const DAY_MS = 24 * 60 * 60 * 1000;

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
};

const addDays = (value, days) => {
  const result = new Date(`${value}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
};

function allocateGroupInventory({ id, propertyId, startDate, endDate, roomsAllocated }) {
  const plan = planGroupRoomTypeAllocation({
    propertyId,
    startDate,
    endDate,
    roomsAllocated,
    excludeGroupId: id,
  });
  if (plan.unallocated > 0) {
    const detail = plan.inventory.length > 0
      ? plan.inventory.map((item) => `${item.roomType}: ${item.available}`).join(', ')
      : 'no room-type inventory is configured for this property';
    throw Object.assign(new Error(
      `Group block would oversell inventory; ${plan.availableTotal} room(s) remain across the stay (${detail})`,
    ), { status: 409 });
  }
  replaceGroupRoomTypeAllocations(id, plan.allocations);
}

const serializeGroup = (row) => ({
  id: row.id,
  propertyId: row.property_id,
  groupName: row.group_name,
  companyName: row.company_name,
  contactPerson: row.contact_person || '',
  contactEmail: row.contact_email || '',
  roomsAllocated: row.rooms_allocated,
  roomsPickedUp: row.rooms_picked_up,
  startDate: row.start_date,
  endDate: row.end_date,
  releaseDate: row.release_date,
  status: row.status,
  groupRate: row.group_rate,
  banquetCateringTotal: row.banquet_catering_total,
  totalValue: row.total_value,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const serializeReview = (row) => ({
  id: row.id,
  propertyId: row.property_id,
  source: row.source,
  guestName: row.guest_name,
  rating: row.rating,
  date: row.review_date,
  reviewText: row.review_text,
  sentiment: row.sentiment,
  aiDraftedResponse: row.response_draft || undefined,
  responseText: row.response_text || undefined,
  responded: !!row.responded_at,
  respondedAt: row.responded_at || undefined,
});

function liveMainPropertyMetrics() {
  const rooms = db.prepare("SELECT status FROM rooms WHERE status != 'Out of Service'").all();
  const occupied = rooms.filter((room) => room.status === 'Occupied').length;
  const occupancyRate = rooms.length ? +((occupied / rooms.length) * 100).toFixed(1) : 0;
  const contractedRates = db.prepare(`
    SELECT totalAmount / nights AS nightlyRate FROM reservations
    WHERE status = 'Checked-In' AND nights > 0 AND totalAmount >= 0
  `).all();
  const adr = contractedRates.length
    ? +(contractedRates.reduce((sum, row) => sum + row.nightlyRate, 0) / contractedRates.length).toFixed(2)
    : 0;
  const totalRevenue = +db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS value FROM folio_items
    WHERE date = ? AND category NOT IN ('Payment', 'Tax')
  `).get(today()).value.toFixed(2);
  return {
    occupancyRate,
    adr,
    revPar: +((adr * occupancyRate) / 100).toFixed(2),
    totalRevenue,
  };
}

r.get('/portfolio/properties', requirePortfolioRole, (req, res) => {
  const properties = db.prepare(`
    SELECT p.*, m.role AS membership_role,
      d.business_date, d.occupancy_rate, d.adr, d.revpar,
      d.total_revenue, d.goppar, d.source
    FROM properties p
    JOIN user_property_memberships m ON m.property_id = p.id AND m.user_id = ?
    LEFT JOIN property_daily_metrics d ON d.property_id = p.id
      AND d.business_date = (
        SELECT MAX(d2.business_date) FROM property_daily_metrics d2 WHERE d2.property_id = p.id
      )
    WHERE p.status = 'Active'
    ORDER BY p.name
  `).all(req.user.id);
  const mainMetrics = liveMainPropertyMetrics();
  res.json(properties.map((property) => {
    const operational = property.id === 'prop-main' ? mainMetrics : null;
    return {
      id: property.id,
      code: property.code,
      propertyName: property.name,
      totalRooms: property.total_rooms,
      timezone: property.timezone,
      currency: property.currency,
      locale: property.locale,
      membershipRole: property.membership_role,
      businessDate: property.business_date,
      occupancyRate: operational?.occupancyRate ?? property.occupancy_rate ?? 0,
      adr: operational?.adr ?? property.adr ?? 0,
      revPar: operational?.revPar ?? property.revpar ?? 0,
      totalRevenue: operational?.totalRevenue ?? property.total_revenue ?? 0,
      goppar: property.goppar ?? 0,
      source: operational ? 'Live PMS operations' : property.source || 'No data',
    };
  }));
});

r.get('/groups', requireCommercialRole, (req, res) => {
  res.json(db.prepare(`
    SELECT g.* FROM group_bookings g
    JOIN user_property_memberships m ON m.property_id = g.property_id
    WHERE m.user_id = ?
    ORDER BY g.start_date, g.group_name
  `).all(req.user.id).map(serializeGroup));
});

r.post('/groups', requireCommercialRole, (req, res) => {
  const b = req.body || {};
  const groupName = typeof b.groupName === 'string' ? b.groupName.trim() : '';
  const companyName = typeof b.companyName === 'string' ? b.companyName.trim() : '';
  const contactPerson = typeof b.contactPerson === 'string' ? b.contactPerson.trim() : '';
  const contactEmail = typeof b.contactEmail === 'string' ? b.contactEmail.trim() : '';
  const propertyId = typeof b.propertyId === 'string' ? b.propertyId.trim() : 'prop-main';
  if (!groupName || !companyName) {
    return res.status(400).json({ error: 'groupName and companyName are required' });
  }
  if (!isDate(b.startDate) || !isDate(b.endDate) || b.endDate <= b.startDate) {
    return res.status(400).json({ error: 'startDate and endDate must be valid dates with endDate after startDate' });
  }
  if (contactEmail && !/^\S+@\S+\.\S+$/.test(contactEmail)) {
    return res.status(400).json({ error: 'contactEmail must be a valid email address' });
  }
  if (!Number.isInteger(b.roomsAllocated) || b.roomsAllocated < 1) {
    return res.status(400).json({ error: 'roomsAllocated must be a positive integer' });
  }
  if (!isFiniteNumber(b.groupRate) || b.groupRate < 0
    || !isFiniteNumber(b.banquetCateringTotal ?? 0) || (b.banquetCateringTotal ?? 0) < 0) {
    return res.status(400).json({ error: 'groupRate and banquetCateringTotal must be finite non-negative numbers' });
  }
  const property = db.prepare(`
    SELECT p.* FROM properties p
    JOIN user_property_memberships m ON m.property_id = p.id
    WHERE p.id = ? AND m.user_id = ? AND p.status = 'Active'
  `).get(propertyId, req.user.id);
  if (!property) return res.status(404).json({ error: 'Property not found or not available to this user' });
  if (b.roomsAllocated > property.total_rooms) {
    return res.status(400).json({ error: `roomsAllocated cannot exceed property inventory (${property.total_rooms})` });
  }
  const status = b.status || 'Tentative Hold';
  if (!ACTIVE_GROUP_STATUS_SET.has(status)) {
    return res.status(400).json({ error: 'New group blocks must be Tentative Hold or Definite Block' });
  }
  const releaseDate = b.releaseDate || addDays(b.startDate, -14);
  if (!isDate(releaseDate) || releaseDate > b.startDate) {
    return res.status(400).json({ error: 'releaseDate must be a valid date on or before startDate' });
  }
  const nights = (Date.parse(`${b.endDate}T00:00:00.000Z`) - Date.parse(`${b.startDate}T00:00:00.000Z`)) / DAY_MS;
  const groupRate = toMoney(b.groupRate);
  const catering = toMoney(b.banquetCateringTotal ?? 0);
  const totalValue = toMoney((b.roomsAllocated * groupRate * nights) + catering);
  const id = uid('grp');
  const now = new Date().toISOString();
  tx(() => {
    const allocationPlan = planGroupRoomTypeAllocation({
      propertyId,
      startDate: b.startDate,
      endDate: b.endDate,
      roomsAllocated: b.roomsAllocated,
    });
    if (allocationPlan.unallocated > 0) {
      const detail = allocationPlan.inventory.length > 0
        ? allocationPlan.inventory.map((item) => `${item.roomType}: ${item.available}`).join(', ')
        : 'no room-type inventory is configured for this property';
      throw Object.assign(new Error(
        `Group block would oversell inventory; ${allocationPlan.availableTotal} room(s) remain across the stay (${detail})`,
      ), { status: 409 });
    }
    db.prepare(`INSERT INTO group_bookings
      (id, property_id, group_name, company_name, contact_person, contact_email,
        rooms_allocated, rooms_picked_up, start_date, end_date, release_date, status,
        group_rate, banquet_catering_total, total_value, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, propertyId, groupName, companyName, contactPerson, contactEmail,
        b.roomsAllocated, b.startDate, b.endDate, releaseDate, status, groupRate,
        catering, totalValue, req.user.id, now, now);
    replaceGroupRoomTypeAllocations(id, allocationPlan.allocations);
    enqueueWebhookEvent('group.created', {
      id, propertyId, groupName, companyName, roomsAllocated: b.roomsAllocated,
      startDate: b.startDate, endDate: b.endDate, releaseDate, status, totalValue,
    }, { database: db, requestId: req.id, manageTransaction: false });
  });
  res.status(201).json(serializeGroup(db.prepare('SELECT * FROM group_bookings WHERE id = ?').get(id)));
});

r.patch('/groups/:id', requireCommercialRole, (req, res) => {
  const current = db.prepare(`
    SELECT g.* FROM group_bookings g
    JOIN user_property_memberships m ON m.property_id = g.property_id
    WHERE g.id = ? AND m.user_id = ?
  `).get(req.params.id, req.user.id);
  if (!current) return res.status(404).json({ error: 'Group block not found' });
  const status = req.body?.status ?? current.status;
  const roomsPickedUp = req.body?.roomsPickedUp ?? current.rooms_picked_up;
  if (!GROUP_STATUSES.has(status)) return res.status(400).json({ error: 'Unsupported group status' });
  if (!Number.isInteger(roomsPickedUp) || roomsPickedUp < 0 || roomsPickedUp > current.rooms_allocated) {
    return res.status(400).json({ error: 'roomsPickedUp must be between zero and roomsAllocated' });
  }
  tx(() => {
    if (ACTIVE_GROUP_STATUS_SET.has(status)) {
      allocateGroupInventory({
        id: current.id,
        propertyId: current.property_id,
        startDate: current.start_date,
        endDate: current.end_date,
        roomsAllocated: current.rooms_allocated,
      });
    }
    db.prepare('UPDATE group_bookings SET status = ?, rooms_picked_up = ?, updated_at = ? WHERE id = ?')
      .run(status, roomsPickedUp, new Date().toISOString(), current.id);
  });
  res.json(serializeGroup(db.prepare('SELECT * FROM group_bookings WHERE id = ?').get(current.id)));
});

r.get('/reputation/reviews', requireCommercialRole, (req, res) => {
  res.json(db.prepare(`
    SELECT review.* FROM reputation_reviews review
    JOIN user_property_memberships m ON m.property_id = review.property_id
    WHERE m.user_id = ?
    ORDER BY review.review_date DESC, review.id
  `).all(req.user.id).map(serializeReview));
});

r.post('/reputation/reviews/:id/respond', requireCommercialRole, (req, res) => {
  const responseText = typeof req.body?.responseText === 'string' ? req.body.responseText.trim() : '';
  if (!responseText || responseText.length > 5000) {
    return res.status(400).json({ error: 'responseText is required and must be at most 5000 characters' });
  }
  const review = db.prepare(`
    SELECT review.* FROM reputation_reviews review
    JOIN user_property_memberships m ON m.property_id = review.property_id
    WHERE review.id = ? AND m.user_id = ?
  `).get(req.params.id, req.user.id);
  if (!review) return res.status(404).json({ error: 'Review not found' });
  const now = new Date().toISOString();
  tx(() => {
    db.prepare(`UPDATE reputation_reviews
      SET response_text = ?, responded_by = ?, responded_at = ? WHERE id = ?`)
      .run(responseText, req.user.id, now, review.id);
    enqueueWebhookEvent('reputation.response_approved', {
      reviewId: review.id,
      propertyId: review.property_id,
      source: review.source,
      respondedAt: now,
    }, { database: db, requestId: req.id, manageTransaction: false });
  });
  res.json({
    ...serializeReview(db.prepare('SELECT * FROM reputation_reviews WHERE id = ?').get(review.id)),
    publication: 'Saved in NexusHOS; external review connector not configured',
  });
});

r.get('/esg/metrics', requirePortfolioRole, (req, res) => {
  const propertyId = typeof req.query?.propertyId === 'string' && req.query.propertyId.trim()
    ? req.query.propertyId.trim()
    : 'prop-main';
  const membership = db.prepare(`
    SELECT 1 FROM user_property_memberships
    WHERE user_id = ? AND property_id = ?
  `).get(req.user.id, propertyId);
  if (!membership) return res.status(404).json({ error: 'Property not found or not available to this user' });
  const metric = db.prepare(`
    SELECT * FROM esg_metrics WHERE property_id = ? ORDER BY date DESC LIMIT 1
  `).get(propertyId);
  if (!metric) return res.status(404).json({ error: 'No ESG metrics are available' });
  res.json({
    propertyId,
    date: metric.date,
    carbonPerOccupiedRoomKg: metric.carbon_per_occupied_room_kg,
    energyKwhSaved: metric.energy_kwh_saved,
    hvacAutoSetbacksTriggered: metric.hvac_auto_setbacks_triggered,
    waterConsumptionLiters: metric.water_consumption_liters,
    renewableEnergyPercentage: metric.renewable_energy_percentage,
    source: metric.source,
  });
});

r.post('/esg/actions/hvac-setback', requireGeneralManager, (req, res) => {
  const target = typeof req.body?.target === 'string' ? req.body.target.trim() : 'Eligible vacant rooms';
  const propertyId = typeof req.body?.propertyId === 'string' && req.body.propertyId.trim()
    ? req.body.propertyId.trim()
    : 'prop-main';
  if (!target || target.length > 200) return res.status(400).json({ error: 'target must be 1-200 characters' });
  const membership = db.prepare(`
    SELECT 1 FROM user_property_memberships
    WHERE user_id = ? AND property_id = ?
  `).get(req.user.id, propertyId);
  if (!membership) return res.status(404).json({ error: 'Property not found or not available to this user' });
  const id = uid('esg-action');
  const requestedAt = new Date().toISOString();
  tx(() => {
    db.prepare(`INSERT INTO esg_actions
      (id, property_id, action_type, target, status, requested_by, requested_at, provider, result)
      VALUES (?, ?, 'HVAC Setback', ?, 'Awaiting Provider', ?, ?, NULL, ?)`)
      .run(id, propertyId, target, req.user.id, requestedAt,
        'Request recorded safely; configure a building-management connector before device execution.');
    enqueueWebhookEvent('esg.action_requested', {
      id,
      propertyId,
      actionType: 'HVAC Setback',
      target,
      status: 'Awaiting Provider',
      requestedAt,
    }, { database: db, requestId: req.id, manageTransaction: false });
  });
  res.status(202).json(db.prepare('SELECT * FROM esg_actions WHERE id = ?').get(id));
});

export default r;
