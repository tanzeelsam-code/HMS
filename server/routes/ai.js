// routes/ai.js — pricing forecast, demand forecast, copilot, anomalies.
// All logic is deterministic and computed live from the DB (no fake labels).
import { Router } from 'express';
import { db, tx, uid, today } from '../db.js';
import { requireRoles } from '../auth.js';
import { assertReservationCanCheckIn } from './core.js';
import { createStructuredAiResponse, getAiProviderStatus } from '../ai-provider.js';
import { createPostgresRateLimiter } from '../security.js';

const r = Router();
const requireFinanceRole = requireRoles('General Manager', 'Finance');
const aiRequestRateLimit = createPostgresRateLimiter({
  database: db,
  scope: 'api.ai.actor',
  limit: 30,
  windowMs: 60_000,
  keyGenerator: (req) => req.user?.id || req.ip,
});
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

const operationalSnapshot = (user) => {
  const businessDate = today();
  const stats = occupancyStats();
  const canSeeFinancials = ['General Manager', 'Finance'].includes(user?.role);
  const count = (sql, ...params) => Number(db.prepare(sql).get(...params)?.n || 0);
  return {
    businessDate,
    userRole: user?.role || 'Staff',
    rooms: {
      totalOperational: stats.totalRooms,
      occupied: stats.occupiedRooms,
      occupancyRate: stats.occupancyRate,
      ready: count("SELECT COUNT(*) AS n FROM rooms WHERE status = 'Vacant Clean'"),
      dirty: count("SELECT COUNT(*) AS n FROM rooms WHERE status = 'Vacant Dirty'"),
      outOfService: count("SELECT COUNT(*) AS n FROM rooms WHERE status = 'Out of Service'"),
    },
    guestFlow: {
      arrivalsToday: count(
        "SELECT COUNT(*) AS n FROM reservations WHERE checkIn = ? AND status = 'Confirmed'",
        businessDate,
      ),
      departuresToday: count(
        "SELECT COUNT(*) AS n FROM reservations WHERE checkOut = ? AND status = 'Checked-In'",
        businessDate,
      ),
      vipArrivals: count(
        "SELECT COUNT(*) AS n FROM reservations WHERE checkIn = ? AND status = 'Confirmed' AND vipTier IN ('Gold','Platinum')",
        businessDate,
      ),
    },
    operations: {
      activeHousekeeping: count(
        "SELECT COUNT(*) AS n FROM housekeeping_tasks WHERE status IN ('Pending','In-Progress')",
      ),
      urgentHousekeeping: count(
        "SELECT COUNT(*) AS n FROM housekeeping_tasks WHERE status IN ('Pending','In-Progress') AND priority = 'Urgent'",
      ),
      openMaintenance: count(
        "SELECT COUNT(*) AS n FROM maintenance_orders WHERE status IN ('Open','In-Progress')",
      ),
      urgentMaintenance: count(
        "SELECT COUNT(*) AS n FROM maintenance_orders WHERE status IN ('Open','In-Progress') AND priority IN ('Urgent','High')",
      ),
      lowStockItems: count('SELECT COUNT(*) AS n FROM inventory_items WHERE onHand <= parLevel'),
    },
    ...(canSeeFinancials ? {
      financials: {
        adr: stats.adr,
        revPar: stats.revPar,
      },
    } : {}),
  };
};

const briefingSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    priorities: {
      type: 'array',
      maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          urgency: { type: 'string', enum: ['critical', 'high', 'normal'] },
          title: { type: 'string' },
          reason: { type: 'string' },
          nextStep: { type: 'string' },
          route: {
            type: 'string',
            enum: ['reservations', 'housekeeping', 'maintenance', 'procurement', 'ai-revenue', 'tape-chart'],
          },
          evidence: { type: 'array', items: { type: 'string' }, maxItems: 3 },
        },
        required: ['urgency', 'title', 'reason', 'nextStep', 'route', 'evidence'],
      },
    },
    opportunities: {
      type: 'array',
      maxItems: 3,
      items: { type: 'string' },
    },
  },
  required: ['summary', 'priorities', 'opportunities'],
};

const fallbackBriefing = (snapshot) => {
  const priorities = [];
  if (snapshot.guestFlow.arrivalsToday > 0) {
    priorities.push({
      urgency: snapshot.guestFlow.vipArrivals > 0 ? 'high' : 'normal',
      title: 'Prepare today’s arrivals',
      reason: `${snapshot.guestFlow.arrivalsToday} guest arrival(s) are still confirmed, including ${snapshot.guestFlow.vipArrivals} VIP arrival(s).`,
      nextStep: 'Review assignments, requests, and room readiness before check-in.',
      route: 'reservations',
      evidence: [
        `${snapshot.guestFlow.arrivalsToday} confirmed arrivals`,
        `${snapshot.rooms.ready} vacant clean rooms`,
      ],
    });
  }
  if (snapshot.operations.activeHousekeeping > 0 || snapshot.rooms.dirty > 0) {
    priorities.push({
      urgency: snapshot.operations.urgentHousekeeping > 0 ? 'high' : 'normal',
      title: 'Complete the room-readiness queue',
      reason: `${snapshot.operations.activeHousekeeping} housekeeping task(s) are active and ${snapshot.rooms.dirty} room(s) still need service.`,
      nextStep: 'Assign urgent rooms first and inspect completed work.',
      route: 'housekeeping',
      evidence: [
        `${snapshot.operations.urgentHousekeeping} urgent housekeeping tasks`,
        `${snapshot.rooms.dirty} dirty rooms`,
      ],
    });
  }
  if (snapshot.operations.openMaintenance > 0) {
    priorities.push({
      urgency: snapshot.operations.urgentMaintenance > 0 ? 'high' : 'normal',
      title: 'Protect saleable inventory',
      reason: `${snapshot.operations.openMaintenance} engineering work order(s) remain open.`,
      nextStep: 'Resolve safety and guest-impacting issues before lower-priority work.',
      route: 'maintenance',
      evidence: [
        `${snapshot.operations.urgentMaintenance} high-priority work orders`,
        `${snapshot.rooms.outOfService} rooms out of service`,
      ],
    });
  }
  if (snapshot.operations.lowStockItems > 0) {
    priorities.push({
      urgency: 'normal',
      title: 'Replenish low-stock items',
      reason: `${snapshot.operations.lowStockItems} inventory item(s) are at or below par.`,
      nextStep: 'Review reorder quantities and pending purchase orders.',
      route: 'procurement',
      evidence: [`${snapshot.operations.lowStockItems} items at or below par`],
    });
  }

  return {
    summary: priorities.length
      ? `${priorities.length} operating area(s) need attention on ${snapshot.businessDate}. Occupancy is ${snapshot.rooms.occupancyRate}%.`
      : `No urgent operating exceptions are visible on ${snapshot.businessDate}. Occupancy is ${snapshot.rooms.occupancyRate}%.`,
    priorities: priorities.slice(0, 4),
    opportunities: [
      snapshot.rooms.ready > 0 ? `${snapshot.rooms.ready} ready room(s) remain available for direct or walk-in demand.` : null,
      snapshot.guestFlow.vipArrivals > 0 ? `Personalize arrival preparation for ${snapshot.guestFlow.vipArrivals} VIP guest(s).` : null,
      snapshot.financials ? `Review pricing against ADR $${snapshot.financials.adr} and RevPAR $${snapshot.financials.revPar}.` : null,
    ].filter(Boolean),
  };
};

r.get('/ai/status', (req, res) => {
  res.json(getAiProviderStatus());
});

r.get('/ai/briefing', aiRequestRateLimit, async (req, res, next) => {
  const snapshot = operationalSnapshot(req.user);
  const status = getAiProviderStatus();
  try {
    const generated = await createStructuredAiResponse({
      schemaName: 'hotel_operations_briefing',
      schema: briefingSchema,
      instructions: [
        'Role: You are an evidence-grounded hotel operations analyst.',
        'Goal: Turn the supplied aggregate property snapshot into a concise shift briefing.',
        'Constraints: Use only supplied facts. Do not invent guests, causes, money, dates, or actions already completed.',
        'Respect the user role and omit financial claims when financials are absent.',
        'Rank guest safety, arrivals, room readiness, and service recovery before optimization.',
        'Output: One short summary, up to four priorities with evidence and a valid app route, and up to three opportunities.',
      ].join('\n'),
      input: JSON.stringify(snapshot),
    });
    res.json({
      ...(generated || fallbackBriefing(snapshot)),
      generatedBy: generated ? 'openai' : 'rules',
      model: generated ? status.model : null,
      generatedAt: new Date().toISOString(),
      businessDate: snapshot.businessDate,
    });
  } catch {
    return res.json({
      ...fallbackBriefing(snapshot),
      generatedBy: 'rules',
      model: null,
      generatedAt: new Date().toISOString(),
      businessDate: snapshot.businessDate,
      providerNotice: 'The enhanced briefing was unavailable, so the verified rules briefing is shown.',
    });
  }
});

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
    mutating: true,
    proposal: 'Create or re-activate housekeeping tasks for every dirty room on the requested floor.',
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
    mutating: true,
    proposal: 'Reassign eligible VIP arrivals to available higher-floor rooms of the same room type.',
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
    mutating: true,
    proposal: 'Apply enabled configured rate recommendations to non-occupied inventory.',
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
    mutating: true,
    proposal: 'Check in the matching confirmed reservation and mark its assigned room occupied.',
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

r.post('/ai/copilot', aiRequestRateLimit, async (req, res, next) => {
  const message = String((req.body || {}).message || '').trim();
  if (!message) return res.status(400).json({ error: 'message is required' });
  const lower = message.toLowerCase();
  const previewActions = req.body?.confirmActions === false;
  const replies = [];
  const actions = [];
  const proposedActions = [];
  for (const intent of copilotIntents) {
    if (intent.test(lower)) {
      if (intent.mutating && previewActions) {
        proposedActions.push(intent.proposal);
        continue;
      }
      const result = intent.run(lower, req.user);
      replies.push(result.reply);
      actions.push(...result.actions);
    }
  }
  if (proposedActions.length > 0) {
    return res.json({
      reply: 'I prepared this change but have not applied it. Review the proposed action before running it.',
      actions: [],
      proposedActions,
      requiresConfirmation: true,
      confirmationMessage: message,
      generatedBy: 'rules',
    });
  }
  if (replies.length === 0) {
    const status = getAiProviderStatus();
    if (status.configured) {
      try {
        const answer = await createStructuredAiResponse({
          schemaName: 'hotel_copilot_answer',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              reply: { type: 'string' },
              suggestedFollowUps: {
                type: 'array',
                maxItems: 3,
                items: { type: 'string' },
              },
            },
            required: ['reply', 'suggestedFollowUps'],
          },
          instructions: [
            'Role: You are a hotel operations copilot answering from an aggregate live property snapshot.',
            'Goal: Answer the staff question directly and recommend a useful next step.',
            'Constraints: Use only supplied evidence. Never claim that an action was executed.',
            'Do not expose or infer guest personal information. State when the snapshot lacks the answer.',
            'Keep the reply under 120 words.',
          ].join('\n'),
          input: JSON.stringify({ question: message, snapshot: operationalSnapshot(req.user) }),
          maxOutputTokens: 500,
        });
        return res.json({
          ...answer,
          actions: [],
          generatedBy: 'openai',
          model: status.model,
        });
      } catch {
        // Keep the deterministic capability path available if the provider is
        // unavailable, rate-limited, or refuses the request.
      }
    }
    return res.json({
      reply: `I need an enhanced AI connection to answer that safely. The verified commands available now are: ${CAPABILITIES.join('; ')}.`,
      actions: [],
      generatedBy: 'rules',
    });
  }
  res.json({ reply: replies.join(' '), actions, generatedBy: 'rules' });
});

// ---------------------------------------------------------------- anomalies ----
r.get('/ai/anomalies', requireFinanceRole, (req, res) => {
  const anomalies = [];

  for (const row of db.prepare(`
    SELECT res.id, res.guestName, res.roomNumber,
      COALESCE(SUM(f.amount), 0)
      + GREATEST(0, res.totalAmount - COALESCE(SUM(
        CASE WHEN f.category = 'Room Charge' THEN f.amount ELSE 0 END
      ), 0)) AS balance
    FROM reservations res LEFT JOIN folio_items f ON res.id = f.reservation_id
    WHERE res.status = 'Checked-In'
    GROUP BY res.id
    HAVING COALESCE(SUM(f.amount), 0)
      + GREATEST(0, res.totalAmount - COALESCE(SUM(
        CASE WHEN f.category = 'Room Charge' THEN f.amount ELSE 0 END
      ), 0)) < -0.005`).all()) {
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
