// routes/ai.js — pricing forecast, demand forecast, copilot, anomalies.
// All logic is deterministic and computed live from the DB (no fake labels).
import { Router } from 'express';
import { db, tx, uid, today } from '../db.js';
import { requireRoles } from '../auth.js';
import { assertReservationCanCheckIn } from './core.js';

const r = Router();
const requireFinanceRole = requireRoles('General Manager', 'Finance');
const DAY_MS = 86400000;
const addDays = (dateStr, n) => new Date(new Date(dateStr).getTime() + n * DAY_MS).toISOString().slice(0, 10);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const occupancyStats = () => {
  const rooms = db.prepare('SELECT status FROM rooms').all();
  const occupied = rooms.filter((x) => x.status === 'Occupied');
  const availableRooms = rooms.filter((room) => room.status !== 'Out of Service').length;
  const occupancyRate = availableRooms ? +((occupied.length / availableRooms) * 100).toFixed(1) : 0;
  const rates = db.prepare(`
    SELECT totalAmount / nights AS nightlyRate
    FROM reservations
    WHERE status = 'Checked-In' AND nights > 0 AND totalAmount >= 0
  `).all();
  const adr = rates.length
    ? +(rates.reduce((sum, row) => sum + row.nightlyRate, 0) / rates.length).toFixed(2)
    : 0;
  return { totalRooms: availableRooms, occupiedRooms: occupied.length, occupancyRate, adr, revPar: +((adr * occupancyRate) / 100).toFixed(2) };
};

// -------------------------------------------------------- pricing forecast ----
r.get('/ai/pricing-forecast', requireFinanceRole, (req, res) => {
  const t = today();
  const horizon = addDays(t, 14);
  const types = db.prepare("SELECT DISTINCT type FROM rooms WHERE status != 'Out of Service' ORDER BY type").all().map((x) => x.type);
  const forecast = types.map((type) => {
    const rooms = db.prepare("SELECT * FROM rooms WHERE type = ? AND status != 'Out of Service'").all(type);
    const roomCount = rooms.length;
    const baseRate = rooms.reduce((s, x) => s + x.basePrice, 0) / roomCount;
    const occupiedNow = rooms.filter((x) => x.status === 'Occupied').length;
    const currentPace = occupiedNow / roomCount;

    const bookings = db.prepare(`
      SELECT checkIn, checkOut FROM reservations
      WHERE roomType = ? AND status IN ('Confirmed','Checked-In')
        AND checkOut > ? AND checkIn < ?`).all(type, t, horizon);

    let bookedRoomNights = 0;
    let weekendNights = 0;
    for (const b of bookings) {
      const start = b.checkIn > t ? b.checkIn : t;
      const end = b.checkOut < horizon ? b.checkOut : horizon;
      for (let d = start; d < end; d = addDays(d, 1)) {
        bookedRoomNights++;
        const dow = new Date(d + 'T00:00:00Z').getUTCDay();
        if (dow === 5 || dow === 6) weekendNights++;
      }
    }
    const capacity = roomCount * 14;
    const occupancyForecast = capacity ? +(clamp(bookedRoomNights / capacity, 0, 1) * 100).toFixed(1) : 0;
    const weekendShare = bookedRoomNights ? weekendNights / bookedRoomNights : 0;
    const weekendBoost = weekendShare > 2 / 7 ? 0.05 : 0;
    const demandMultiplier = +(clamp(1 + (bookedRoomNights / capacity - 0.5) * 0.4 + weekendBoost, 0.85, 1.4)).toFixed(2);
    const recommendedRate = Math.round((baseRate * demandMultiplier) / 5) * 5;

    const reasoning = [
      `${occupiedNow}/${roomCount} ${type} rooms currently occupied (${(currentPace * 100).toFixed(0)}% pace).`,
      `${bookings.length} bookings on the books for the next 14 days = ${bookedRoomNights} room-nights of ${capacity} available (${occupancyForecast}% forecast).`,
      weekendBoost > 0
        ? `Weekend demand skew: ${(weekendShare * 100).toFixed(0)}% of booked nights fall on Fri/Sat (+5% demand).`
        : `No unusual weekend demand skew (${(weekendShare * 100).toFixed(0)}% of booked nights on Fri/Sat).`,
      `Demand multiplier ${demandMultiplier} applied to base rate $${baseRate.toFixed(0)} -> recommended $${recommendedRate}.`,
    ];
    return { roomType: type, baseRate: +baseRate.toFixed(2), recommendedRate, demandMultiplier, occupancyForecast, reasoning };
  });
  res.json(forecast);
});

// --------------------------------------------------------- demand forecast ----
r.get('/ai/demand-forecast', requireFinanceRole, (req, res) => {
  const t = today();
  const totalRooms = db.prepare("SELECT COUNT(*) AS n FROM rooms WHERE status != 'Out of Service'").get().n;
  const days = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(t, i);
    const occupied = db.prepare(`
      SELECT COUNT(DISTINCT roomNumber) AS n FROM reservations
      WHERE status IN ('Confirmed','Checked-In') AND checkIn <= ? AND checkOut > ?`).get(d, d).n;
    const arrivals = db.prepare(`
      SELECT COUNT(*) AS n FROM reservations
      WHERE checkIn = ? AND status IN ('Confirmed','Checked-In')`).get(d).n;
    days.push({
      date: d,
      expectedOccupancy: totalRooms
        ? +(clamp(occupied / totalRooms, 0, 1) * 100).toFixed(1)
        : 0,
      arrivals,
    });
  }
  res.json(days);
});

// ----------------------------------------------------------------- copilot ----
const copilotIntents = [
  {
    test: (m) => /occupancy/.test(m),
    run: () => {
      const s = occupancyStats();
      return {
        reply: `Occupancy today is ${s.occupancyRate}% (${s.occupiedRooms} of ${s.totalRooms} rooms occupied).`,
        actions: [],
      };
    },
  },
  {
    test: (m) => /rev\s?par|adr/.test(m),
    run: (_m, user) => {
      if (!['General Manager', 'Finance'].includes(user?.role)) {
        return { reply: 'ADR and RevPAR are restricted to General Manager and Finance roles.', actions: [] };
      }
      const s = occupancyStats();
      return {
        reply: `RevPAR is $${s.revPar} (ADR $${s.adr} at ${s.occupancyRate}% occupancy, computed from contracted in-house rates).`,
        actions: [],
      };
    },
  },
  {
    test: (m) => /(clean|start housekeeping)\s+floor\s+\d+/.test(m),
    run: (m, user) => {
      if (!['General Manager', 'Front Desk', 'Housekeeping'].includes(user?.role)) {
        return { reply: 'Starting housekeeping requires a General Manager, Front Desk, or Housekeeping role.', actions: [] };
      }
      const floor = parseInt(m.match(/(?:clean|start housekeeping)\s+floor\s+(\d+)/)[1], 10);
      const dirty = db.prepare("SELECT * FROM rooms WHERE floor = ? AND status = 'Vacant Dirty'").all(floor);
      if (dirty.length === 0) {
        return { reply: `No dirty rooms on floor ${floor} — nothing to clean.`, actions: [] };
      }
      const staff = db.prepare("SELECT name FROM employees WHERE department = 'Housekeeping' AND status = 'Active' ORDER BY name").all();
      const actions = tx(() => dirty.map((room, i) => {
        const assignee = staff.length ? staff[i % staff.length].name : 'Unassigned';
        const existing = db.prepare(
          "SELECT id FROM housekeeping_tasks WHERE roomNumber = ? AND status IN ('Pending','In-Progress')"
        ).get(room.number);
        if (existing) {
          db.prepare("UPDATE housekeeping_tasks SET status = 'In-Progress', assignedTo = ?, priority = 'Urgent' WHERE id = ?")
            .run(assignee, existing.id);
          return `Re-activated task for room ${room.number}, assigned to ${assignee}`;
        }
        db.prepare(`INSERT INTO housekeeping_tasks (id, roomNumber, roomType, floor, taskType, status, assignedTo, priority, etaMinutes)
          VALUES (?, ?, ?, ?, 'Full Clean', 'In-Progress', ?, 'Urgent', 45)`)
          .run(uid('hk'), room.number, room.type, floor, assignee);
        return `Started Full Clean for room ${room.number}, assigned to ${assignee}`;
      }));
      return { reply: `Floor ${floor}: started ${dirty.length} housekeeping task(s).`, actions };
    },
  },
  {
    test: (m) => /vip/.test(m) && /(arrival|assign|high floor)/.test(m),
    run: (m, user) => {
      if (!['General Manager', 'Front Desk'].includes(user?.role)) {
        return { reply: 'Reassigning VIP arrivals requires a General Manager or Front Desk role.', actions: [] };
      }
      const vips = db.prepare(`
        SELECT * FROM reservations
        WHERE status = 'Confirmed' AND vipTier IN ('Gold','Platinum') AND checkIn >= ?`).all(today());
      if (vips.length === 0) {
        return { reply: 'No confirmed VIP arrivals on the books to reassign.', actions: [] };
      }
      const actions = tx(() => {
        const out = [];
        for (const rez of vips) {
          const current = db.prepare('SELECT * FROM rooms WHERE number = ?').get(rez.roomNumber);
          const candidate = db.prepare(`
            SELECT rm.* FROM rooms rm
            WHERE rm.type = ? AND rm.status = 'Vacant Clean' AND rm.floor > ?
              AND NOT EXISTS (
                SELECT 1 FROM reservations other
                WHERE other.roomNumber = rm.number
                  AND other.status IN ('Confirmed','Checked-In')
                  AND other.checkIn < ? AND other.checkOut > ?
              )
            ORDER BY rm.floor DESC, rm.number DESC LIMIT 1
          `).get(rez.roomType, current ? current.floor : 0, rez.checkOut, rez.checkIn);
          if (!candidate) {
            out.push(`${rez.guestName} (${rez.vipTier}): no higher-floor ${rez.roomType} available, kept room ${rez.roomNumber}`);
            continue;
          }
          db.prepare('UPDATE reservations SET roomNumber = ? WHERE id = ?').run(candidate.number, rez.id);
          db.prepare("UPDATE rooms SET status = 'Reserved', status_since = ? WHERE number = ?").run(today(), candidate.number);
          const oldRoomHasAnotherStay = db.prepare(`
            SELECT 1 FROM reservations
            WHERE roomNumber = ? AND id != ? AND status IN ('Confirmed','Checked-In')
            LIMIT 1`).get(rez.roomNumber, rez.id);
          if (current?.status === 'Reserved' && !oldRoomHasAnotherStay) {
            db.prepare("UPDATE rooms SET status = 'Vacant Clean', status_since = ? WHERE number = ?")
              .run(today(), rez.roomNumber);
          }
          out.push(`${rez.guestName} (${rez.vipTier}): moved ${rez.roomNumber} -> ${candidate.number} (floor ${candidate.floor})`);
        }
        return out;
      });
      return { reply: `Processed ${vips.length} VIP arrival(s).`, actions };
    },
  },
  {
    test: (m) => /apply\s+(the\s+)?recommended\s+rates/.test(m),
    run: (m, user) => {
      if (!['General Manager', 'Finance'].includes(user?.role)) {
        return { reply: 'Applying recommended rates requires a General Manager or Finance role.', actions: [] };
      }
      const rules = db.prepare('SELECT * FROM pricing_rules WHERE autoApply = 1').all();
      if (rules.length === 0) return { reply: 'No pricing rules have autoApply enabled.', actions: [] };
      const actions = tx(() => rules.map((rule) => {
        const result = db.prepare("UPDATE rooms SET currentPrice = ? WHERE type = ? AND status != 'Occupied'")
          .run(rule.recommendedRate, rule.roomType);
        return `${rule.roomType}: ${Number(result.changes)} non-occupied room rate(s) set to $${rule.recommendedRate}`;
      }));
      return { reply: `Applied recommended rates for ${rules.length} rule(s) with autoApply on.`, actions };
    },
  },
  {
    test: (m) => /check[- ]?in\s+[a-z]/i.test(m),
    run: (m, user) => {
      if (!['General Manager', 'Front Desk'].includes(user?.role)) {
        return { reply: 'Guest check-in requires a General Manager or Front Desk role.', actions: [] };
      }
      const query = m.match(/check[- ]?in\s+(.+)/i)[1].trim();
      const candidates = /^gh-/i.test(query)
        ? db.prepare("SELECT * FROM reservations WHERE status = 'Confirmed' AND lower(code) = lower(?)").all(query)
        : db.prepare("SELECT * FROM reservations WHERE status = 'Confirmed' AND lower(guestName) LIKE ? ORDER BY guestName, code")
          .all(`%${query}%`);
      const exactNameMatches = candidates.filter((candidate) => candidate.guestName.toLowerCase() === query);
      const matches = exactNameMatches.length > 0 ? exactNameMatches : candidates;
      if (matches.length === 0) {
        return { reply: `No confirmed reservation found matching "${query}".`, actions: [] };
      }
      if (matches.length > 1) {
        const choices = matches.slice(0, 5).map((candidate) => `${candidate.guestName} (${candidate.code})`).join(', ');
        return {
          reply: `Multiple confirmed reservations match "${query}": ${choices}. Use the exact reservation code, for example "check in ${matches[0].code}".`,
          actions: [],
        };
      }
      const [rez] = matches;
      try {
        tx(() => {
          const current = db.prepare('SELECT * FROM reservations WHERE id = ?').get(rez.id);
          assertReservationCanCheckIn(current);
          db.prepare("UPDATE reservations SET status = 'Checked-In' WHERE id = ?").run(current.id);
          db.prepare("UPDATE rooms SET status = 'Occupied', currentGuestName = ?, status_since = ? WHERE number = ?")
            .run(current.guestName, today(), current.roomNumber);
        });
      } catch (error) {
        if (error.status) {
          return { reply: `Could not check in ${rez.guestName}: ${error.message}.`, actions: [] };
        }
        throw error;
      }
      return {
        reply: `Checked in ${rez.guestName} (${rez.code}) into room ${rez.roomNumber}.`,
        actions: [`Reservation ${rez.id} -> Checked-In`, `Room ${rez.roomNumber} -> Occupied`],
      };
    },
  },
];

const CAPABILITIES = [
  '"what is occupancy today"',
  '"revpar this week"',
  '"clean floor 1" / "start housekeeping floor 2"',
  '"assign VIP arrivals to high floors"',
  '"apply recommended rates"',
  '"check in <guest name>"',
];

r.post('/ai/copilot', (req, res) => {
  const message = String((req.body || {}).message || '').trim();
  if (!message) return res.status(400).json({ error: 'message is required' });
  const lower = message.toLowerCase();
  const replies = [];
  const actions = [];
  for (const intent of copilotIntents) {
    if (intent.test(lower)) {
      const result = intent.run(lower, req.user);
      replies.push(result.reply);
      actions.push(...result.actions);
    }
  }
  if (replies.length === 0) {
    return res.json({
      reply: `I didn't understand that. I can help with: ${CAPABILITIES.join('; ')}.`,
      actions: [],
    });
  }
  res.json({ reply: replies.join(' '), actions });
});

// ---------------------------------------------------------------- anomalies ----
r.get('/ai/anomalies', requireFinanceRole, (req, res) => {
  const anomalies = [];

  for (const row of db.prepare(`
    SELECT res.id, res.guestName, res.roomNumber,
      ROUND(
        COALESCE(SUM(f.amount), 0)
        + MAX(0, res.totalAmount - COALESCE(SUM(
          CASE WHEN f.category = 'Room Charge' THEN f.amount ELSE 0 END
        ), 0)),
        2
      ) AS balance
    FROM reservations res LEFT JOIN folio_items f ON res.id = f.reservation_id
    WHERE res.status = 'Checked-In'
    GROUP BY res.id HAVING balance < -0.005`).all()) {
    anomalies.push({
      severity: 'High',
      message: `Reservation ${row.id} (${row.guestName}, room ${row.roomNumber}) has a projected checkout credit of $${Math.abs(row.balance).toFixed(2)} after contracted room charges.`,
    });
  }

  for (const room of db.prepare(`
    SELECT r.number FROM rooms r
    WHERE r.status = 'Occupied' AND NOT EXISTS (
      SELECT 1 FROM reservations res WHERE res.roomNumber = r.number AND res.status = 'Checked-In')`).all()) {
    anomalies.push({
      severity: 'High',
      message: `Room ${room.number} is marked Occupied but has no checked-in reservation.`,
    });
  }

  for (const item of db.prepare('SELECT name, onHand, parLevel, unit FROM inventory_items WHERE onHand <= parLevel').all()) {
    anomalies.push({
      severity: item.onHand < item.parLevel ? 'High' : 'Medium',
      message: `Low stock: ${item.name} has ${item.onHand} ${item.unit} on hand (par ${item.parLevel}).`,
    });
  }

  const cutoff = addDays(today(), -3);
  for (const room of db.prepare("SELECT number, status_since FROM rooms WHERE status = 'Out of Service'").all()) {
    if (room.status_since && room.status_since <= cutoff) {
      anomalies.push({
        severity: 'Medium',
        message: `Room ${room.number} has been Out of Service since ${room.status_since} (more than 3 days).`,
      });
    }
  }

  res.json(anomalies);
});

export default r;
