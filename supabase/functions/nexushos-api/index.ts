import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.8";

type StaffUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: number;
  must_change_password: number;
  auth_invalid_before: number;
  propertyId: string;
  allowedPropertyIds: string[];
  managerPropertyIds: string[];
  organizationId: string;
  timezone: string;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
}).schema("nexushos");
const authClient = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const allowedOrigins = new Set([
  "https://www.nexushos.com",
  "https://nexushos.com",
  "https://nexus-hos.tanzeelsam.workers.dev",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
const publicPaths = new Set([
  "GET /health",
  "GET /booking/availability",
  "POST /booking/quote",
  "POST /booking/reservations",
  "POST /auth/register-hotel",
]);
const allowedStaffRoles = new Set([
  "General Manager",
  "Front Desk",
  "Housekeeping",
  "Finance",
]);
const roleAccess: Record<string, string[]> = {
  finance: ["General Manager", "Finance"],
  frontDesk: ["General Manager", "Front Desk"],
  folio: ["General Manager", "Front Desk", "Finance"],
  operations: ["General Manager", "Front Desk", "Housekeeping"],
  manager: ["General Manager"],
};

const json = (body: unknown, status = 200, origin = "") => new Response(
  status === 204 ? null : JSON.stringify(body),
  {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": allowedOrigins.has(origin) ? origin : "https://www.nexushos.com",
    "access-control-allow-headers": "authorization, apikey, content-type, idempotency-key, x-nexushos-property-id, x-turnstile-token",
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "vary": "Origin",
  },
});

const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const today = (timeZone = "UTC") => new Intl.DateTimeFormat("en-CA", {
  timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const parseJson = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== "string") return (value as T) ?? fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};
const asNumber = (value: unknown) => Number(value || 0);
const requireNoError = (error: unknown) => {
  if (error) throw error;
};
const throwDatabaseError = (error: unknown) => {
  if ((error as { code?: string } | null)?.code === "23P01") {
    throw fail("Room is already reserved for the requested dates", 409);
  }
  if (error) throw error;
};
const validateEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
const validatePassword = (value: string) =>
  value.length >= 12 && /[a-z]/.test(value) && /[A-Z]/.test(value)
  && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
const nightsBetween = (checkIn: string, checkOut: string) => {
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  const nights = (end - start) / 86_400_000;
  if (!Number.isInteger(nights) || nights < 1 || nights > 30) {
    throw fail("checkIn and checkOut must define a stay of 1 to 30 nights");
  }
  return nights;
};
const clientAddress = (req: Request) =>
  req.headers.get("cf-connecting-ip")
  || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  || "unknown";
const sha256 = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
const jwtIssuedAt = (token: string) => {
  try {
    const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")));
    return Number(payload.iat || 0);
  } catch {
    return 0;
  }
};
async function enforceRateLimit(req: Request, scope: string, limit: number, windowMs: number) {
  const pepper = Deno.env.get("NEXUSHOS_RATE_LIMIT_PEPPER") || serviceKey.slice(-32);
  const bucketKey = await sha256(`${pepper}:${clientAddress(req)}`);
  const { data, error } = await db.rpc("consume_rate_limit", {
    p_scope: scope,
    p_bucket_key: bucketKey,
    p_limit: limit,
    p_window_ms: windowMs,
    p_now_ms: Date.now(),
  });
  if (error) {
    console.error("rate-limit unavailable", scope, error);
    throw fail("Request protection is temporarily unavailable", 503);
  }
  if (data !== true) throw fail("Too many requests. Please try again later.", 429);
}
async function verifyTurnstile(req: Request, token: string) {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY")?.trim();
  if (!secret) throw fail("Buyer registration is not configured", 503);
  if (!token) throw fail("Human verification is required", 400);
  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  const remoteIp = clientAddress(req);
  if (remoteIp !== "unknown") form.set("remoteip", remoteIp);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  const result = await response.json().catch(() => ({})) as { success?: boolean };
  if (!response.ok || result.success !== true) throw fail("Human verification failed", 400);
}

const room = (r: Record<string, unknown>) => ({
  id: r.id, number: r.number, type: r.type, floor: r.floor, status: r.status,
  basePrice: asNumber(r.baseprice), currentPrice: asNumber(r.currentprice),
  amenities: parseJson(r.amenities, []), ...(r.currentguestname ? { currentGuestName: r.currentguestname } : {}),
});
const folio = (r: Record<string, unknown>) => ({
  id: r.id, date: r.date, description: r.description, category: r.category,
  amount: asNumber(r.amount), postedBy: r.postedby,
});
const reservation = (r: Record<string, unknown>, items: Record<string, unknown>[] = []) => ({
  id: r.id, code: r.code, guestName: r.guestname, guestEmail: r.guestemail,
  guestPhone: r.guestphone, vipTier: r.viptier, roomNumber: r.roomnumber,
  roomType: r.roomtype, checkIn: r.checkin, checkOut: r.checkout,
  ...(r.actualcheckout ? { actualCheckOut: r.actualcheckout } : {}),
  nights: asNumber(r.nights), guestsCount: asNumber(r.guestscount), status: r.status,
  channel: r.channel, totalAmount: asNumber(r.totalamount), paidAmount: asNumber(r.paidamount),
  specialRequests: r.specialrequests || "", contactlessCheckInCompleted: Boolean(r.contactlesscheckincompleted),
  folioItems: items.map(folio),
});
const housekeeping = (r: Record<string, unknown>) => ({
  id: r.id, roomNumber: r.roomnumber, roomType: r.roomtype, floor: r.floor,
  taskType: r.tasktype, status: r.status, assignedTo: r.assignedto,
  priority: r.priority, etaMinutes: asNumber(r.etaminutes),
});
const pricing = (r: Record<string, unknown>) => ({
  id: r.id, roomType: r.roomtype, baseRate: asNumber(r.baserate),
  recommendedRate: asNumber(r.recommendedrate), demandFactor: asNumber(r.demandfactor),
  competitorAvgRate: asNumber(r.competitoravgrate), occupancyTrigger: asNumber(r.occupancytrigger),
  autoApply: Boolean(r.autoapply),
});
const channel = (r: Record<string, unknown>) => ({
  id: r.id, name: r.name, logo: r.logo, connected: Boolean(r.connected),
  activeListings: asNumber(r.activelistings), commissionRate: asNumber(r.commissionrate),
  lastSync: r.lastsync, syncLatency: r.synclatency, bookingsThisMonth: asNumber(r.bookingsthismonth),
});
const maintenance = (r: Record<string, unknown>) => ({
  id: r.id, roomNumber: r.roomnumber, issueDescription: r.issuedescription,
  category: r.category, priority: r.priority, status: r.status, reportedBy: r.reportedby,
  assignedEngineer: r.assignedengineer, slaMinutes: asNumber(r.slaminutes),
  reportedTime: r.reportedtime, safetyCritical: Boolean(r.safetycritical),
});
const inventoryItem = (r: Record<string, unknown>) => ({
  id: r.id, name: r.name, category: r.category, stockQty: asNumber(r.onhand),
  onHand: asNumber(r.onhand), unit: r.unit, minReorderLevel: asNumber(r.parlevel),
  parLevel: asNumber(r.parlevel), unitPrice: asNumber(r.costperunit),
  costPerUnit: asNumber(r.costperunit),
});
const employee = (r: Record<string, unknown>) => ({
  id: r.id, name: r.name, role: r.role, department: r.department,
  email: r.email || "", phone: r.phone || "", status: r.status,
  shift: r.shift, hourlyRate: asNumber(r.hourlyrate),
});
const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "NexusHOS Supabase API",
    version: "3.0.0",
    description: "Authenticated hotel operations API running as a Supabase Edge Function.",
  },
  servers: [{ url: `${supabaseUrl}/functions/v1/nexushos-api` }],
  paths: {
    "/health": { get: { summary: "Service health", tags: ["System"], responses: { "200": { description: "Healthy" } } } },
    "/rooms": { get: { summary: "List rooms", tags: ["Operations"], responses: { "200": { description: "Rooms" } } } },
    "/reservations": {
      get: { summary: "List reservations", tags: ["Reservations"], responses: { "200": { description: "Reservations" } } },
      post: { summary: "Create reservation", tags: ["Reservations"], responses: { "200": { description: "Reservation created" } } },
    },
    "/booking/availability": { get: { summary: "Public availability", tags: ["Booking"], responses: { "200": { description: "Availability" } } } },
    "/booking/quote": { post: { summary: "Create public quote", tags: ["Booking"], responses: { "200": { description: "Quote" } } } },
    "/booking/reservations": { post: { summary: "Confirm public booking", tags: ["Booking"], responses: { "201": { description: "Booking confirmed" } } } },
    "/metrics": { get: { summary: "Hotel metrics", tags: ["Analytics"], responses: { "200": { description: "Metrics" } } } },
  },
};

async function rows(table: string, propertyId: string, order?: string) {
  let query = db.from(table).select("*");
  if (!propertyId) throw fail("Property context is required", 500);
  query = query.eq("property_id", propertyId);
  if (order) query = query.order(order);
  const { data, error } = await query;
  throwDatabaseError(error);
  return (data || []) as Record<string, unknown>[];
}

async function currentStaff(req: Request): Promise<StaffUser> {
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) throw fail("Authentication required", 401);
  const { data: auth, error: authError } = await authClient.auth.getUser(bearer);
  if (authError || !auth.user) throw fail("Session expired. Please sign in again.", 401);
  const { data, error } = await db.from("users").select(
    "id,name,email,role,active,must_change_password,auth_invalid_before",
  ).eq("id", auth.user.id).maybeSingle();
  if (error) throw error;
  if (!data || !data.active) throw fail("This staff account is not active", 403);
  if (jwtIssuedAt(bearer) <= asNumber(data.auth_invalid_before)) {
    throw fail("This session has been revoked. Please sign in again.", 401);
  }
  
  const { data: memberships, error: membershipsError } = await db
    .from("user_property_memberships")
    .select("property_id,role,properties!inner(organization_id,status,timezone)")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: true });
  if (membershipsError) throw membershipsError;
  const activeMemberships = (memberships || []).filter((membership) => {
    const property = membership.properties as unknown as { status?: string } | null;
    return property?.status === "Active";
  });
  if (activeMemberships.length === 0) {
    throw fail("This account has no active property access", 403);
  }

  const requestedPropertyId = req.headers.get("x-nexushos-property-id")?.trim();
  const selected = requestedPropertyId
    ? activeMemberships.find((membership) => membership.property_id === requestedPropertyId)
    : activeMemberships[0];
  if (!selected) throw fail("You do not have access to the requested property", 403);
  const selectedProperty = selected.properties as unknown as { organization_id: string; timezone: string };
  const allowedPropertyIds = activeMemberships.map((membership) => String(membership.property_id));
  const managerPropertyIds = activeMemberships
    .filter((membership) => membership.role === "General Manager")
    .map((membership) => String(membership.property_id));

  return {
    ...(data as StaffUser),
    role: String(selected.role),
    propertyId: String(selected.property_id),
    allowedPropertyIds,
    managerPropertyIds,
    organizationId: String(selectedProperty.organization_id),
    timezone: String(selectedProperty.timezone || "UTC"),
  };
}

function requireRole(user: StaffUser, group: keyof typeof roleAccess) {
  if (!roleAccess[group].includes(user.role)) {
    throw fail(`This action requires one of these roles: ${roleAccess[group].join(", ")}`, 403);
  }
}
function requireManagedPropertyIds(user: StaffUser, value: unknown, allowEmpty = false) {
  if (!Array.isArray(value)) throw fail("propertyIds must be an array");
  const propertyIds = [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  if ((!allowEmpty && propertyIds.length === 0) || propertyIds.length > 100) {
    throw fail(`propertyIds must contain ${allowEmpty ? "0" : "1"} to 100 properties`);
  }
  if (propertyIds.some((propertyId) => !user.allowedPropertyIds.includes(propertyId))) {
    throw fail("You cannot grant access to a property you do not manage", 403);
  }
  return propertyIds;
}

async function getManagedUser(userId: string, allowedPropertyIds: string[]) {
  const { data: user, error: uErr } = await db.from("users").select("*").eq("id", userId).maybeSingle();
  if (uErr) throw uErr;
  if (!user) throw fail("User not found", 404);

  const [membershipsRes, propertiesRes, sessionsRes] = await Promise.all([
    db.from("user_property_memberships").select("*").eq("user_id", userId).in("property_id", allowedPropertyIds),
    db.from("properties").select("*").in("id", allowedPropertyIds),
    db.from("sessions").select("token").eq("user_id", userId),
  ]);

  const propertiesMap = new Map((propertiesRes.data || []).map((p) => [p.id, p]));
  const memberships = (membershipsRes.data || []).map((m) => {
    const prop = propertiesMap.get(m.property_id);
    return {
      propertyId: m.property_id,
      propertyCode: prop?.code || m.property_id,
      propertyName: prop?.name || m.property_id,
      propertyStatus: prop?.status || "Active",
      role: m.role || user.role,
      createdAt: m.created_at || new Date().toISOString(),
    };
  });
  if (memberships.length === 0) throw fail("User not found", 404);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: Boolean(user.active),
    mustChangePassword: Boolean(user.must_change_password),
    activeSessionCount: (sessionsRes.data || []).length,
    memberships,
    version: `${user.id}-${user.email}-${user.role}-${user.active}-${user.must_change_password}`,
  };
}

async function listManagedUsers(allowedPropertyIds: string[]) {
  const { data: memberships, error: membershipError } = await db
    .from("user_property_memberships")
    .select("user_id")
    .in("property_id", allowedPropertyIds);
  if (membershipError) throw membershipError;
  const userIds = [...new Set((memberships || []).map((membership) => String(membership.user_id)))];
  return Promise.all(userIds.map((userId) => getManagedUser(userId, allowedPropertyIds)));
}

async function requireExclusiveUserControl(userId: string, managedPropertyIds: string[]) {
  const { data, error } = await db
    .from("user_property_memberships")
    .select("property_id")
    .eq("user_id", userId);
  if (error) throw error;
  const allPropertyIds = (data || []).map((membership) => String(membership.property_id));
  if (allPropertyIds.length === 0
      || allPropertyIds.some((propertyId) => !managedPropertyIds.includes(propertyId))) {
    throw fail("This account also belongs to a property you do not manage", 403);
  }
}

async function listReservations(propertyId: string) {
  const [reservations, items] = await Promise.all([
    rows("reservations", propertyId, "checkin"),
    rows("folio_items", propertyId, "date"),
  ]);
  return reservations.map((r) => reservation(
    r,
    items.filter((item) => item.reservation_id === r.id),
  ));
}

async function metrics(propertyId: string, timezone: string) {
  const [rooms, reservations, folios] = await Promise.all([
    rows("rooms", propertyId), rows("reservations", propertyId), rows("folio_items", propertyId),
  ]);
  const businessDate = today(timezone);
  const sellable = rooms.filter((r) => r.status !== "Out of Service").length;
  const occupied = rooms.filter((r) => r.status === "Occupied").length;
  const active = reservations.filter((r) => ["Confirmed", "Checked-In"].includes(String(r.status)));
  const roomRevenue = folios.filter((f) => f.category === "Room Charge")
    .reduce((sum, item) => sum + asNumber(item.amount), 0);
  const occupiedNights = Math.max(1, active.reduce((sum, item) => sum + asNumber(item.nights), 0));
  const occupancyRate = sellable ? Number(((occupied / sellable) * 100).toFixed(1)) : 0;
  const adr = Number((roomRevenue / occupiedNights).toFixed(2));
  return {
    businessDate,
    occupancyRate,
    financialMetricsAvailable: true,
    adr,
    revPar: Number((adr * occupancyRate / 100).toFixed(2)),
    totalRevenue: Number(folios.reduce((sum, item) => sum + asNumber(item.amount), 0).toFixed(2)),
    arrivalsToday: reservations.filter((r) => r.checkin === businessDate && !["Cancelled", "No-Show"].includes(String(r.status))).length,
    departuresToday: reservations.filter((r) => r.checkout === businessDate && !["Cancelled", "No-Show"].includes(String(r.status))).length,
    inHouseGuests: reservations.filter((r) => r.status === "Checked-In").reduce((sum, item) => sum + asNumber(item.guestscount), 0),
    dirtyRooms: rooms.filter((r) => r.status === "Vacant Dirty").length,
  };
}

async function resolvePublicProperty(identifier?: string) {
  const candidate = identifier?.trim() || "prop-main";
  const { data, error } = await db
    .from("properties")
    .select("id,name,code,currency,timezone,status")
    .or(`id.eq.${candidate},code.eq.${candidate}`)
    .eq("status", "Active")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw fail("Hotel property not found", 404);
  return data;
}

async function bookingAvailability(url: URL, forcedPropertyId?: string) {
  const checkIn = url.searchParams.get("checkIn") || "";
  const checkOut = url.searchParams.get("checkOut") || "";
  const guests = Number(url.searchParams.get("guests") || 1);
  const nights = nightsBetween(checkIn, checkOut);
  const property = await resolvePublicProperty(
    forcedPropertyId || url.searchParams.get("property") || undefined,
  );
  const [allRooms, allReservations] = await Promise.all([
    rows("rooms", property.id),
    rows("reservations", property.id),
  ]);
  const reservedNumbers = new Set(allReservations.filter((r) =>
    ["Confirmed", "Checked-In"].includes(String(r.status))
    && String(r.checkin) < checkOut && String(r.checkout) > checkIn
  ).map((r) => r.roomnumber));
  const details: Record<string, { maxGuests: number; description: string }> = {
    "Standard King": { maxGuests: 2, description: "A calm city retreat with a king bed and thoughtful essentials." },
    "Deluxe Ocean View": { maxGuests: 3, description: "Elevated comfort, sea views, and room to settle in." },
    "Executive Suite": { maxGuests: 4, description: "A generous suite with separate space to work and unwind." },
    "Presidential Suite": { maxGuests: 6, description: "Our signature stay with expansive living and private outdoor space." },
  };
  const grouped = new Map<string, Record<string, unknown>>();
  for (const item of allRooms) {
    if (item.status === "Out of Service" || reservedNumbers.has(item.number)) continue;
    const type = String(item.type);
    const typeDetails = details[type];
    if (!typeDetails || guests > typeDetails.maxGuests) continue;
    const current = grouped.get(type);
    if (current) current.availableCount = asNumber(current.availableCount) + 1;
    else grouped.set(type, {
      roomType: type, description: typeDetails.description, maxGuests: typeDetails.maxGuests,
      availableCount: 1, nightlyRate: asNumber(item.currentprice), currency: property.currency,
      amenities: parseJson(item.amenities, []),
    });
  }
  return {
    propertyId: property.id,
    propertyCode: property.code,
    propertyName: property.name,
    checkIn,
    checkOut,
    nights,
    guests,
    businessDate: today(property.timezone),
    currency: property.currency,
    roomTypes: [...grouped.values()],
  };
}

async function createQuote(body: Record<string, unknown>) {
  const checkIn = String(body.checkIn || "");
  const checkOut = String(body.checkOut || "");
  const guests = Number(body.guests || 1);
  const roomType = String(body.roomType || "");
  const nights = nightsBetween(checkIn, checkOut);
  const availability = await bookingAvailability(new URL(
    `https://local/booking/availability?checkIn=${encodeURIComponent(checkIn)}&checkOut=${encodeURIComponent(checkOut)}&guests=${guests}`,
  ), String(body.propertyId || body.property || "prop-main"));
  const selected = availability.roomTypes.find((item) => item.roomType === roomType);
  if (!selected || asNumber(selected.availableCount) < 1) throw fail("That room type is no longer available", 409);
  const nightlyRate = asNumber(selected.nightlyRate);
  const roomTotal = Number((nightlyRate * nights).toFixed(2));
  const taxRate = 0.12;
  const taxAmount = Number((roomTotal * taxRate).toFixed(2));
  const grandTotal = Number((roomTotal + taxAmount).toFixed(2));
  const quoteId = id("quote");
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const record = {
    id: quoteId, property_id: availability.propertyId,
    check_in: checkIn, check_out: checkOut, nights, guests_count: guests,
    room_type: roomType, nightly_rate: nightlyRate, room_total: roomTotal, tax_rate: taxRate,
    tax_amount: taxAmount, grand_total: grandTotal, currency: availability.currency, status: "Open",
    created_at: new Date().toISOString(), expires_at: expiresAt,
  };
  const { error } = await db.from("booking_quotes").insert(record);
  if (error) throw error;
  return {
    quoteId, propertyId: availability.propertyId, propertyName: availability.propertyName,
    checkIn, checkOut, nights, guests, roomType, nightlyRate, roomTotal,
    taxRate, taxAmount, grandTotal, currency: availability.currency, expiresAt,
    ratePlan: "Best Available Rate", paymentDueNow: 0,
    cancellationPolicy: "Free cancellation until 18:00 on the day before arrival.",
  };
}

async function confirmBooking(body: Record<string, unknown>, requestKey: string | null) {
  if (!requestKey || requestKey.length < 8) throw fail("Idempotency-Key header is required");
  const quoteId = String(body.quoteId || "");
  const guest = (body.guest || {}) as Record<string, unknown>;
  if (body.termsAccepted !== true) throw fail("Terms must be accepted");
  const guestName = `${String(guest.firstName || "").trim()} ${String(guest.lastName || "").trim()}`.trim();
  const guestEmail = String(guest.email || "").trim().toLowerCase();
  if (!guestName || !guestEmail.includes("@")) throw fail("Valid guest name and email are required");
  const { data: quote, error: quoteError } = await db
    .from("booking_quotes")
    .select("*")
    .eq("id", quoteId)
    .maybeSingle();
  if (quoteError) throw quoteError;
  if (!quote || quote.status !== "Open" || Date.parse(quote.expires_at) <= Date.now()) throw fail("Quote has expired", 409);
  const propertyId = String(quote.property_id);
  const { data: replay, error: replayError } = await db
    .from("booking_idempotency")
    .select("response_body,response_status")
    .eq("property_id", propertyId)
    .eq("idempotency_key", requestKey)
    .maybeSingle();
  if (replayError) throw replayError;
  if (replay) return JSON.parse(String(replay.response_body));
  const availability = await bookingAvailability(new URL(
    `https://local/booking/availability?checkIn=${quote.check_in}&checkOut=${quote.check_out}&guests=${quote.guests_count}`,
  ), propertyId);
  if (!availability.roomTypes.some((item) => item.roomType === quote.room_type && asNumber(item.availableCount) > 0)) {
    throw fail("That room type is no longer available", 409);
  }
  const [allRooms, allReservations] = await Promise.all([
    rows("rooms", propertyId, "number"),
    rows("reservations", propertyId),
  ]);
  const assigned = allRooms.find((candidate) => candidate.type === quote.room_type
    && candidate.status !== "Out of Service"
    && !allReservations.some((r) => ["Confirmed", "Checked-In"].includes(String(r.status))
      && r.roomnumber === candidate.number && String(r.checkin) < quote.check_out && String(r.checkout) > quote.check_in));
  if (!assigned) throw fail("Inventory changed; please search again", 409);
  const reservationId = id("res");
  const code = `NX-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const confirmation = {
    reservationId, code, status: "Confirmed", guestName, guestEmail,
    roomType: quote.room_type, checkIn: quote.check_in, checkOut: quote.check_out,
    nights: quote.nights, guests: quote.guests_count, roomTotal: quote.room_total,
    taxAmount: quote.tax_amount, grandTotal: quote.grand_total, currency: quote.currency,
    paymentDueNow: 0, cancellationPolicy: "Free cancellation until 18:00 on the day before arrival.",
  };
  const { error } = await db.from("reservations").insert({
    id: reservationId, property_id: propertyId, code, guestname: guestName, guestemail: guestEmail,
    guestphone: String(guest.phone || ""), viptier: "Member", roomnumber: assigned.number,
    roomtype: quote.room_type, checkin: quote.check_in, checkout: quote.check_out,
    nights: quote.nights, guestscount: quote.guests_count, status: "Confirmed",
    channel: "Direct Web", totalamount: quote.grand_total, paidamount: 0,
    specialrequests: String(body.specialRequests || ""), contactlesscheckincompleted: 0,
  });
  throwDatabaseError(error);
  await Promise.all([
    db.from("booking_quotes").update({
      status: "Consumed",
      consumed_at: new Date().toISOString(),
      reservation_id: reservationId,
    }).eq("property_id", propertyId).eq("id", quoteId),
    db.from("booking_idempotency").insert({
      property_id: propertyId, idempotency_key: requestKey, request_hash: quoteId, response_status: 201,
      response_body: JSON.stringify(confirmation), reservation_id: reservationId, created_at: new Date().toISOString(),
    }),
  ]);
  return confirmation;
}

async function registerHotelTenant(req: Request, body: Record<string, unknown>) {
  if (Deno.env.get("NEXUSHOS_SELF_SERVICE_SIGNUP_ENABLED") !== "true") {
    throw fail("Self-service buyer registration is not enabled", 404);
  }
  await enforceRateLimit(req, "buyer-registration", 3, 60 * 60_000);
  await verifyTurnstile(req, String(body.turnstileToken || req.headers.get("x-turnstile-token") || ""));

  const hotelName = String(body.hotelName || "").trim();
  const adminName = String(body.adminName || "").trim();
  const adminEmail = String(body.adminEmail || "").trim().toLowerCase();
  const adminPassword = String(body.adminPassword || "");
  const totalRooms = Number(body.totalRooms || 10);
  const currency = String(body.currency || "USD").trim().toUpperCase();
  const timezone = String(body.timezone || "America/New_York");

  if (!hotelName || hotelName.length > 160 || !adminName || adminName.length > 160
      || !validateEmail(adminEmail) || !adminPassword) {
    throw fail("Hotel name, admin name, email, and password are required");
  }
  if (!validatePassword(adminPassword)) {
    throw fail("Password must be at least 12 characters and include upper, lower, number, and symbol");
  }
  if (!Number.isInteger(totalRooms) || totalRooms < 1 || totalRooms > 500) {
    throw fail("totalRooms must be an integer between 1 and 500");
  }
  if (!/^[A-Z]{3}$/.test(currency)) throw fail("currency must be a three-letter ISO code");
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  } catch {
    throw fail("timezone must be a valid IANA time zone");
  }

  const orgId = id("org");
  const propId = id("prop");
  const codePrefix = hotelName.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase().padEnd(3, "X");
  const code = `${codePrefix}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const baseSlug = hotelName.toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "hotel";
  const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;
  const createdAt = new Date().toISOString();
  let authUserId = "";

  try {
    const { data: authResult, error: authError } = await authClient.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { name: adminName },
      app_metadata: { product: "nexushos" },
    });
    if (authError || !authResult.user) throw authError || fail("Unable to create administrator", 500);
    authUserId = authResult.user.id;

    requireNoError((await db.from("organizations").insert({
      id: orgId,
      name: hotelName,
      slug,
      created_at: createdAt,
    })).error);

    requireNoError((await db.from("properties").insert({
      id: propId,
      organization_id: orgId,
      code,
      name: hotelName,
      timezone,
      currency,
      locale: "en-US",
      total_rooms: totalRooms,
      status: "Active",
      created_at: createdAt,
    })).error);

    const roomTypes = ["Standard King", "Deluxe Ocean View", "Executive Suite"];
    const roomInserts = Array.from({ length: totalRooms }, (_, index) => {
      const roomType = roomTypes[index % roomTypes.length];
      const basePrice = roomType === "Executive Suite" ? 350 : roomType === "Deluxe Ocean View" ? 220 : 150;
      return {
        id: id("room"),
        property_id: propId,
        number: String(101 + index),
        type: roomType,
        floor: Math.ceil((index + 1) / 10),
        status: "Vacant Clean",
        baseprice: basePrice,
        currentprice: basePrice,
        amenities: JSON.stringify(["Wi-Fi", "Air Conditioning"]),
        status_since: today(timezone),
      };
    });
    requireNoError((await db.from("rooms").insert(roomInserts)).error);

    const roomTypeRates = [
      ["Standard King", 150],
      ["Deluxe Ocean View", 220],
      ["Executive Suite", 350],
    ];
    requireNoError((await db.from("pricing_rules").insert(roomTypeRates.map(([roomType, rate]) => ({
      id: id("price"),
      property_id: propId,
      roomtype: roomType,
      baserate: rate,
      recommendedrate: rate,
      demandfactor: 1,
      competitoravgrate: rate,
      occupancytrigger: 80,
      autoapply: 0,
    })))).error);
    requireNoError((await db.from("channels").insert({
      id: id("channel"),
      property_id: propId,
      name: "Direct Web",
      logo: "🌐",
      connected: 1,
      activelistings: totalRooms,
      commissionrate: 0,
      lastsync: "Provisioned",
      synclatency: "Live",
      bookingsthismonth: 0,
    })).error);

    requireNoError((await db.from("users").insert({
      id: authUserId,
      name: adminName,
      email: adminEmail,
      password: null,
      role: "General Manager",
      active: 1,
      must_change_password: 0,
    })).error);

    requireNoError((await db.from("user_property_memberships").insert({
      user_id: authUserId,
      property_id: propId,
      role: "General Manager",
      created_at: createdAt,
    })).error);
  } catch (error) {
    // Auth and Postgres cannot share one transaction. Compensate in reverse
    // order so a failed registration never leaves a usable partial tenant.
    if (authUserId) {
      await db.from("user_property_memberships").delete().eq("user_id", authUserId);
      await db.from("users").delete().eq("id", authUserId);
    }
    await db.from("channels").delete().eq("property_id", propId);
    await db.from("pricing_rules").delete().eq("property_id", propId);
    await db.from("rooms").delete().eq("property_id", propId);
    await db.from("properties").delete().eq("id", propId);
    await db.from("organizations").delete().eq("id", orgId);
    if (authUserId) await authClient.auth.admin.deleteUser(authUserId);
    throw error;
  }

  return {
    success: true,
    message: "Hotel organization registered successfully.",
    organization: { id: orgId, name: hotelName },
    property: { id: propId, code, name: hotelName, totalRooms },
    adminUser: { id: authUserId, email: adminEmail, role: "General Manager" },
  };
}

async function handle(req: Request, path: string, url: URL, user: StaffUser | null) {
  const key = `${req.method} ${path}`;
  const body = ["POST", "PATCH", "PUT"].includes(req.method)
    ? await req.json().catch(() => ({})) as Record<string, unknown>
    : {};

  if (key === "GET /health") return { status: "ok", database: "ok", timestamp: new Date().toISOString() };
  if (key === "GET /booking/availability") return bookingAvailability(url);
  if (key === "POST /booking/quote") return createQuote(body);
  if (key === "POST /booking/reservations") return confirmBooking(body, req.headers.get("idempotency-key"));
  if (key === "POST /auth/register-hotel") return registerHotelTenant(req, body);
  if (!user) throw fail("Authentication required", 401);
  if (key === "GET /auth/session") return { user: {
    name: user.name,
    role: user.role,
    email: user.email,
    mustChangePassword: Boolean(user.must_change_password),
    propertyId: user.propertyId,
    allowedPropertyIds: user.allowedPropertyIds,
  }};
  if (key === "POST /auth/logout") return { success: true };
  if (key === "POST /auth/password-changed") {
    const { error } = await db.from("users").update({ must_change_password: 0 }).eq("id", user.id);
    throwDatabaseError(error);
    return { success: true };
  }
  if (user.must_change_password) {
    throw fail("You must change your temporary password before continuing", 403);
  }

  if (key === "GET /admin/users") {
    requireRole(user, "manager");
    return listManagedUsers(user.managerPropertyIds);
  }
  if (key === "GET /admin/properties") {
    requireRole(user, "manager");
    const { data, error } = await db.from("properties").select("*").in("id", user.managerPropertyIds);
    if (error) throw error;
    return (data || []).map((p) => ({
      id: p.id,
      organizationId: p.organization_id,
      code: p.code,
      name: p.name,
      timezone: p.timezone,
      currency: p.currency,
      locale: p.locale,
      totalRooms: asNumber(p.total_rooms),
      status: p.status,
    }));
  }
  if (key === "POST /admin/users") {
    requireRole(user, "manager");
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const role = String(body.role || "").trim();
    const password = String(body.password || "");
    const propertyIds = requireManagedPropertyIds(
      { ...user, allowedPropertyIds: user.managerPropertyIds },
      body.propertyIds,
    );

    if (!name || name.length > 160 || !validateEmail(email) || !allowedStaffRoles.has(role)) {
      throw fail("A valid name, email, and staff role are required");
    }
    if (!validatePassword(password)) {
      throw fail("Temporary password must be at least 12 characters and include upper, lower, number, and symbol");
    }

    const { data: authUser, error: authError } = await authClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
      app_metadata: { product: "nexushos" },
    });
    if (authError || !authUser.user) throw authError || fail("Unable to create staff account", 500);
    const userId = authUser.user.id;
    try {
      const { error: insertError } = await db.from("users").insert({
        id: userId,
        name,
        email,
        password: null,
        role,
        active: 1,
        must_change_password: 1,
      });
      if (insertError) throw insertError;
      const mems = propertyIds.map((pId) => ({
        user_id: userId,
        property_id: pId,
        role,
        created_at: new Date().toISOString(),
      }));
      const { error: membershipError } = await db.from("user_property_memberships").insert(mems);
      if (membershipError) throw membershipError;
    } catch (error) {
      await db.from("user_property_memberships").delete().eq("user_id", userId);
      await db.from("users").delete().eq("id", userId);
      await authClient.auth.admin.deleteUser(userId);
      throw error;
    }

    return getManagedUser(userId, user.managerPropertyIds);
  }

  const adminUserMatch = path.match(/^\/admin\/users\/([^/]+)$/);
  if (req.method === "PATCH" && adminUserMatch) {
    requireRole(user, "manager");
    const targetId = decodeURIComponent(adminUserMatch[1]);
    await getManagedUser(targetId, user.managerPropertyIds);
    await requireExclusiveUserControl(targetId, user.managerPropertyIds);
    const updates: Record<string, unknown> = {};
    if (body.name != null) {
      const name = String(body.name).trim();
      if (!name || name.length > 160) throw fail("Name is invalid");
      updates.name = name;
    }
    if (body.email != null) {
      const email = String(body.email).trim().toLowerCase();
      if (!validateEmail(email)) throw fail("Email is invalid");
      const { error: authError } = await authClient.auth.admin.updateUserById(targetId, { email });
      if (authError) throw authError;
      updates.email = email;
    }
    if (body.role != null) {
      const role = String(body.role);
      if (!allowedStaffRoles.has(role)) throw fail("Role is invalid");
      updates.role = role;
    }
    const { error } = await db.from("users").update(updates).eq("id", targetId);
    if (error) throw error;
    if (body.role != null) {
      const { error: membershipError } = await db.from("user_property_memberships")
        .update({ role: body.role })
        .eq("user_id", targetId)
        .in("property_id", user.managerPropertyIds);
      if (membershipError) throw membershipError;
    }
    return getManagedUser(targetId, user.managerPropertyIds);
  }

  const adminToggleMatch = path.match(/^\/admin\/users\/([^/]+)\/(disable|deactivate|reactivate|activate)$/);
  if (req.method === "POST" && adminToggleMatch) {
    requireRole(user, "manager");
    const targetId = decodeURIComponent(adminToggleMatch[1]);
    await getManagedUser(targetId, user.managerPropertyIds);
    await requireExclusiveUserControl(targetId, user.managerPropertyIds);
    if (targetId === user.id) throw fail("You cannot change your own active status", 409);
    const action = adminToggleMatch[2];
    const active = ["reactivate", "activate"].includes(action) ? 1 : 0;
    const { error: authError } = await authClient.auth.admin.updateUserById(targetId, {
      ban_duration: active ? "none" : "876000h",
    });
    if (authError) throw authError;
    const { error } = await db.from("users").update({ active }).eq("id", targetId);
    if (error) throw error;
    if (active === 0) {
      await db.from("sessions").delete().eq("user_id", targetId);
    }
    return getManagedUser(targetId, user.managerPropertyIds);
  }

  const adminPassMatch = path.match(/^\/admin\/users\/([^/]+)\/(reset-password|rotate-password)$/);
  if (req.method === "POST" && adminPassMatch) {
    requireRole(user, "manager");
    const targetId = decodeURIComponent(adminPassMatch[1]);
    await getManagedUser(targetId, user.managerPropertyIds);
    await requireExclusiveUserControl(targetId, user.managerPropertyIds);
    const newPassword = String(body.password || body.newPassword || "");
    if (!validatePassword(newPassword)) {
      throw fail("Password must be at least 12 characters and include upper, lower, number, and symbol");
    }
    const { error: authError } = await authClient.auth.admin.updateUserById(targetId, { password: newPassword });
    if (authError) throw authError;
    await db.from("users").update({
      must_change_password: 1,
      auth_invalid_before: Math.floor(Date.now() / 1000),
    }).eq("id", targetId);
    const { error } = await db.from("users").update({
      auth_invalid_before: Math.floor(Date.now() / 1000),
    }).eq("id", targetId);
    if (error) throw error;
    await db.from("sessions").delete().eq("user_id", targetId);
    return getManagedUser(targetId, user.managerPropertyIds);
  }

  const adminRevokeMatch = path.match(/^\/admin\/users\/([^/]+)\/revoke-sessions$/);
  if (req.method === "POST" && adminRevokeMatch) {
    requireRole(user, "manager");
    const targetId = decodeURIComponent(adminRevokeMatch[1]);
    await getManagedUser(targetId, user.managerPropertyIds);
    await requireExclusiveUserControl(targetId, user.managerPropertyIds);
    await db.from("sessions").delete().eq("user_id", targetId);
    return getManagedUser(targetId, user.managerPropertyIds);
  }

  const adminMemsMatch = path.match(/^\/admin\/users\/([^/]+)\/memberships$/);
  if (["PATCH", "POST"].includes(req.method) && adminMemsMatch) {
    requireRole(user, "manager");
    const targetId = decodeURIComponent(adminMemsMatch[1]);
    await getManagedUser(targetId, user.managerPropertyIds);
    const propertyIds = requireManagedPropertyIds(
      { ...user, allowedPropertyIds: user.managerPropertyIds },
      body.propertyIds,
    );
    const { data: u } = await db.from("users").select("role").eq("id", targetId).single();
    const { error: deleteError } = await db.from("user_property_memberships")
      .delete()
      .eq("user_id", targetId)
      .in("property_id", user.managerPropertyIds);
    if (deleteError) throw deleteError;
    const mems = propertyIds.map((pId) => ({
      user_id: targetId,
      property_id: pId,
      role: u?.role || "Front Desk",
      created_at: new Date().toISOString(),
    }));
    const { error: insertError } = await db.from("user_property_memberships").insert(mems);
    if (insertError) throw insertError;
    return getManagedUser(targetId, user.managerPropertyIds);
  }

  if (key === "GET /rooms") return (await rows("rooms", user.propertyId, "number")).map(room);
  if (key === "GET /reservations") { requireRole(user, "folio"); return listReservations(user.propertyId); }
  if (key === "GET /housekeeping") return (await rows("housekeeping_tasks", user.propertyId, "roomnumber")).map(housekeeping);
  if (key === "GET /pricing-rules") { requireRole(user, "finance"); return (await rows("pricing_rules", user.propertyId, "roomtype")).map(pricing); }
  if (key === "GET /channels") { requireRole(user, "folio"); return (await rows("channels", user.propertyId, "name")).map(channel); }
  if (key === "GET /pos-charges") {
    requireRole(user, "folio");
    return (await rows("pos_charges", user.propertyId, "time")).map((r) => ({
      id: r.id, time: r.time, roomNumber: r.roomnumber, guestName: r.guestname,
      outlet: r.outlet, items: parseJson(r.items, []), total: asNumber(r.total), status: r.status,
    }));
  }
  if (key === "GET /metrics") return metrics(user.propertyId, user.timezone);
  if (key === "GET /guests") {
    requireRole(user, "folio");
    return (await rows("guest_profiles", user.propertyId, "name")).map((r) => ({
      id: r.id, name: r.name, email: r.email, phone: r.phone, vipTier: r.viptier,
      totalStays: asNumber(r.totalstays), totalNights: asNumber(r.totalnights),
      lifetimeSpend: asNumber(r.lifetimespend), preferredRoomType: r.preferredroomtype,
      dietaryPreferences: parseJson(r.dietarypreferences, []), notes: r.notes, lastStayDate: r.laststaydate,
    }));
  }
  if (key === "GET /maintenance") return (await rows("maintenance_orders", user.propertyId, "reportedtime")).map(maintenance);
  if (key === "GET /groups") {
    requireRole(user, "frontDesk");
    return (await rows("group_bookings", user.propertyId, "start_date")).map((r) => ({
      id: r.id, groupName: r.group_name, companyName: r.company_name, contactPerson: r.contact_person,
      contactEmail: r.contact_email, roomsAllocated: asNumber(r.rooms_allocated),
      roomsPickedUp: asNumber(r.rooms_picked_up), startDate: r.start_date, endDate: r.end_date,
      releaseDate: r.release_date, status: r.status, groupRate: asNumber(r.group_rate),
      banquetCateringTotal: asNumber(r.banquet_catering_total), totalValue: asNumber(r.total_value),
    }));
  }
  if (key === "GET /reputation/reviews") {
    requireRole(user, "frontDesk");
    return (await rows("reputation_reviews", user.propertyId, "review_date")).map((r) => ({
      id: r.id, source: r.source, guestName: r.guest_name, rating: r.rating, date: r.review_date,
      reviewText: r.review_text, sentiment: r.sentiment, aiDraftedResponse: r.response_draft,
      responseText: r.response_text, respondedAt: r.responded_at, responded: Boolean(r.responded_at),
    }));
  }
  if (key === "GET /esg/metrics") {
    requireRole(user, "finance");
    const values = await rows("esg_metrics", user.propertyId, "date");
    const r = values.at(-1);
    return r ? {
      date: r.date, carbonPerOccupiedRoomKg: asNumber(r.carbon_per_occupied_room_kg),
      energyKwhSaved: asNumber(r.energy_kwh_saved), hvacAutoSetbacksTriggered: asNumber(r.hvac_auto_setbacks_triggered),
      waterConsumptionLiters: asNumber(r.water_consumption_liters),
      renewableEnergyPercentage: asNumber(r.renewable_energy_percentage), source: r.source,
    } : null;
  }
  if (key === "GET /portfolio/properties") {
    requireRole(user, "finance");
    const [{ data: properties, error: propertyError }, { data: daily, error: dailyError }] = await Promise.all([
      db.from("properties").select("*").in("id", user.allowedPropertyIds).order("code"),
      db.from("property_daily_metrics").select("*").in("property_id", user.allowedPropertyIds).order("business_date"),
    ]);
    if (propertyError) throw propertyError;
    if (dailyError) throw dailyError;
    return (properties || []).map((p) => {
      const m = (daily || []).filter((item) => item.property_id === p.id).at(-1);
      return {
        id: p.id, code: p.code, propertyName: p.name, totalRooms: asNumber(p.total_rooms),
        occupancyRate: asNumber(m?.occupancy_rate), adr: asNumber(m?.adr), revPar: asNumber(m?.revpar),
        totalRevenue: asNumber(m?.total_revenue), goppar: asNumber(m?.goppar),
        timezone: p.timezone, currency: p.currency, locale: p.locale,
        businessDate: m?.business_date, source: m?.source,
      };
    });
  }

  const roomMatch = path.match(/^\/rooms\/([^/]+)$/);
  if (req.method === "PATCH" && roomMatch) {
    const updates: Record<string, unknown> = {};
    if (body.status != null) updates.status = body.status;
    if (body.currentPrice != null) { requireRole(user, "finance"); updates.currentprice = body.currentPrice; }
    const { data, error } = await db.from("rooms").update(updates)
      .eq("property_id", user.propertyId).eq("number", decodeURIComponent(roomMatch[1])).select("*").single();
    if (error) throw error;
    return room(data);
  }
  const reservationAction = path.match(/^\/reservations\/([^/]+)\/(check-in|check-out|cancel|no-show)$/);
  if (req.method === "POST" && reservationAction) {
    requireRole(user, "frontDesk");
    const nextStatus: Record<string, string> = {
      "check-in": "Checked-In", "check-out": "Checked-Out", cancel: "Cancelled", "no-show": "No-Show",
    };
    const reservationId = decodeURIComponent(reservationAction[1]);
    const { data: current } = await db.from("reservations").select("*")
      .eq("property_id", user.propertyId).eq("id", reservationId).maybeSingle();
    if (!current) throw fail("Reservation not found", 404);
    const updates: Record<string, unknown> = { status: nextStatus[reservationAction[2]] };
    if (reservationAction[2] === "check-out") updates.actualcheckout = new Date().toISOString();
    const { data, error } = await db.from("reservations").update(updates)
      .eq("property_id", user.propertyId).eq("id", reservationId).select("*").single();
    if (error) throw error;
    const roomStatus = reservationAction[2] === "check-in" ? "Occupied"
      : reservationAction[2] === "check-out" ? "Vacant Dirty" : "Vacant Clean";
    await db.from("rooms").update({
      status: roomStatus,
      currentguestname: reservationAction[2] === "check-in" ? current.guestname : null,
      status_since: today(user.timezone),
    }).eq("property_id", user.propertyId).eq("number", current.roomnumber);
    return reservation(data);
  }
  if (key === "POST /reservations") {
    requireRole(user, "frontDesk");
    const nights = nightsBetween(String(body.checkIn), String(body.checkOut));
    const { data: assigned, error: roomError } = await db.from("rooms").select("*")
      .eq("property_id", user.propertyId).eq("number", body.roomNumber).maybeSingle();
    if (roomError) throw roomError;
    if (!assigned || assigned.status === "Out of Service") throw fail("Room is unavailable", 409);
    const record = {
      id: id("res"), property_id: user.propertyId, code: `NX-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      guestname: body.guestName, guestemail: body.guestEmail, guestphone: body.guestPhone,
      viptier: body.vipTier || "Member", roomnumber: body.roomNumber, roomtype: assigned.type,
      checkin: body.checkIn, checkout: body.checkOut, nights, guestscount: body.guestsCount || 1,
      status: "Confirmed", channel: body.channel || "Direct Web",
      totalamount: asNumber(body.totalAmount) || asNumber(assigned.currentprice) * nights,
      paidamount: asNumber(body.paidAmount), specialrequests: body.specialRequests || "",
      contactlesscheckincompleted: 0,
    };
    const { data, error } = await db.from("reservations").insert(record).select("*").single();
    throwDatabaseError(error);
    await db.from("rooms").update({ status: "Reserved", status_since: today(user.timezone) })
      .eq("property_id", user.propertyId).eq("number", body.roomNumber);
    return reservation(data);
  }
  const folioMatch = path.match(/^\/reservations\/([^/]+)\/folio-items$/);
  if (req.method === "POST" && folioMatch) {
    requireRole(user, "folio");
    const reservationId = decodeURIComponent(folioMatch[1]);
    const { error } = await db.from("folio_items").insert({
      id: id("f"), property_id: user.propertyId, reservation_id: reservationId,
      date: today(user.timezone), description: body.description,
      category: body.category, amount: body.amount, postedby: user.name,
    });
    if (error) throw error;
    const all = await listReservations(user.propertyId);
    return all.find((item) => item.id === reservationId);
  }
  const hkMatch = path.match(/^\/housekeeping\/([^/]+)$/);
  if (req.method === "PATCH" && hkMatch) {
    requireRole(user, "operations");
    const { data, error } = await db.from("housekeeping_tasks").update(body)
      .eq("property_id", user.propertyId).eq("id", decodeURIComponent(hkMatch[1])).select("*").single();
    if (error) throw error;
    return housekeeping(data);
  }
  if (key === "POST /maintenance") {
    requireRole(user, "operations");
    const record = {
      id: id("maint"), property_id: user.propertyId, roomnumber: body.roomNumber, issuedescription: body.issueDescription,
      category: body.category, priority: body.priority || "Normal", status: "Open",
      reportedby: user.name, assignedengineer: body.assignedEngineer || "Unassigned",
      slaminutes: body.slaMinutes || 120, reportedtime: new Date().toISOString(),
      safetycritical: body.safetyCritical ? 1 : 0,
    };
    const { data, error } = await db.from("maintenance_orders").insert(record).select("*").single();
    if (error) throw error;
    return maintenance(data);
  }
  const maintenanceMatch = path.match(/^\/maintenance\/([^/]+)\/resolve$/);
  if (req.method === "PATCH" && maintenanceMatch) {
    requireRole(user, "operations");
    const { data, error } = await db.from("maintenance_orders").update({ status: "Resolved" })
      .eq("property_id", user.propertyId).eq("id", decodeURIComponent(maintenanceMatch[1])).select("*").single();
    if (error) throw error;
    return maintenance(data);
  }
  const pricingMatch = path.match(/^\/pricing-rules\/([^/]+)$/);
  if (req.method === "PATCH" && pricingMatch) {
    requireRole(user, "finance");
    const changes: Record<string, unknown> = {};
    if (body.recommendedRate != null) changes.recommendedrate = body.recommendedRate;
    if (body.autoApply != null) changes.autoapply = body.autoApply ? 1 : 0;
    const { data, error } = await db.from("pricing_rules").update(changes)
      .eq("property_id", user.propertyId).eq("id", decodeURIComponent(pricingMatch[1])).select("*").single();
    if (error) throw error;
    return pricing(data);
  }
  const applyPriceMatch = path.match(/^\/pricing-rules\/([^/]+)\/apply$/);
  if (req.method === "POST" && applyPriceMatch) {
    requireRole(user, "finance");
    const { data: rule } = await db.from("pricing_rules").select("*")
      .eq("property_id", user.propertyId).eq("id", decodeURIComponent(applyPriceMatch[1])).single();
    if (!rule) throw fail("Pricing rule not found", 404);
    await db.from("rooms").update({ currentprice: rule.recommendedrate })
      .eq("property_id", user.propertyId).eq("type", rule.roomtype);
    return pricing(rule);
  }
  if (key === "POST /channels/sync") {
    requireRole(user, "frontDesk");
    const query = db.from("channels").update({ lastsync: "Just now", synclatency: "Live" })
      .eq("property_id", user.propertyId);
    const { error } = body.id ? await query.eq("id", body.id) : await query.neq("id", "");
    if (error) throw error;
    return (await rows("channels", user.propertyId, "name")).map(channel);
  }
  if (key === "POST /pos-charges") {
    requireRole(user, "folio");
    const record = {
      id: id("pos"), property_id: user.propertyId, time: new Date().toISOString(), roomnumber: body.roomNumber,
      guestname: body.guestName || "", outlet: body.outlet || "Hotel",
      items: JSON.stringify(body.items || []), total: asNumber(body.total), status: "Posted",
    };
    const { data, error } = await db.from("pos_charges").insert(record).select("*").single();
    if (error) throw error;
    return {
      id: data.id, time: data.time, roomNumber: data.roomnumber, guestName: data.guestname,
      outlet: data.outlet, items: parseJson(data.items, []), total: asNumber(data.total), status: data.status,
    };
  }
  if (key === "POST /groups") {
    requireRole(user, "frontDesk");
    const totalValue = asNumber(body.groupRate) * asNumber(body.roomsAllocated)
      + asNumber(body.banquetCateringTotal);
    const record = {
      id: id("group"), property_id: user.propertyId,
      group_name: body.groupName, company_name: body.companyName,
      contact_person: body.contactPerson || "", contact_email: body.contactEmail || "",
      rooms_allocated: asNumber(body.roomsAllocated), rooms_picked_up: 0,
      start_date: body.startDate, end_date: body.endDate, release_date: body.releaseDate || null,
      status: body.status || "Tentative Hold", group_rate: asNumber(body.groupRate),
      banquet_catering_total: asNumber(body.banquetCateringTotal), total_value: totalValue,
      created_by: user.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    const { data, error } = await db.from("group_bookings").insert(record).select("*").single();
    if (error) throw error;
    return {
      id: data.id, groupName: data.group_name, companyName: data.company_name,
      contactPerson: data.contact_person, contactEmail: data.contact_email,
      roomsAllocated: asNumber(data.rooms_allocated), roomsPickedUp: asNumber(data.rooms_picked_up),
      startDate: data.start_date, endDate: data.end_date, releaseDate: data.release_date,
      status: data.status, groupRate: asNumber(data.group_rate),
      banquetCateringTotal: asNumber(data.banquet_catering_total), totalValue: asNumber(data.total_value),
    };
  }
  const reviewResponseMatch = path.match(/^\/reputation\/reviews\/([^/]+)\/respond$/);
  if (req.method === "POST" && reviewResponseMatch) {
    requireRole(user, "frontDesk");
    const { data, error } = await db.from("reputation_reviews").update({
      response_text: body.responseText, responded_by: user.id, responded_at: new Date().toISOString(),
    }).eq("property_id", user.propertyId).eq("id", decodeURIComponent(reviewResponseMatch[1])).select("*").single();
    if (error) throw error;
    return {
      id: data.id, source: data.source, guestName: data.guest_name, rating: data.rating,
      date: data.review_date, reviewText: data.review_text, sentiment: data.sentiment,
      aiDraftedResponse: data.response_draft, responseText: data.response_text,
      respondedAt: data.responded_at, responded: Boolean(data.responded_at),
    };
  }
  if (key === "POST /esg/actions/hvac-setback") {
    requireRole(user, "finance");
    const record = {
      id: id("esg"), property_id: user.propertyId, action_type: "HVAC Setback",
      target: body.target || "Eligible vacant rooms", status: "Requested",
      requested_by: user.id, requested_at: new Date().toISOString(), provider: "NexusHOS",
    };
    const { data, error } = await db.from("esg_actions").insert(record).select("*").single();
    if (error) throw error;
    return data;
  }

  if (key === "GET /inventory/items" || key === "GET /inventory/low-stock") {
    requireRole(user, "finance");
    const values = (await rows("inventory_items", user.propertyId, "name")).map(inventoryItem);
    return key.endsWith("low-stock") ? values.filter((item) => item.onHand < item.parLevel) : values;
  }
  if (key === "GET /procurement/vendors") {
    requireRole(user, "finance");
    return (await rows("vendors", user.propertyId, "name")).map((r) => ({
      id: r.id, name: r.name, category: r.category, contact: r.contact,
      contactEmail: "", phone: "", rating: 0,
    }));
  }
  if (key === "GET /procurement/purchase-orders") {
    requireRole(user, "finance");
    const [orders, vendors, items] = await Promise.all([
      rows("purchase_orders", user.propertyId, "orderdate"),
      rows("vendors", user.propertyId),
      rows("inventory_items", user.propertyId),
    ]);
    return orders.map((r) => ({
      id: r.id, poNumber: r.id, vendorName: vendors.find((v) => v.id === r.vendorid)?.name || r.vendorid,
      date: r.orderdate, orderDate: r.orderdate,
      itemName: items.find((item) => item.id === r.itemid)?.name || r.itemid,
      qty: asNumber(r.qty), unitCost: asNumber(r.unitcost),
      totalAmount: asNumber(r.qty) * asNumber(r.unitcost), status: r.status,
    }));
  }
  if (key === "POST /procurement/purchase-orders") {
    requireRole(user, "finance");
    const { data: item } = await db.from("inventory_items").select("*")
      .eq("property_id", user.propertyId).eq("id", body.itemId).maybeSingle();
    if (!item) throw fail("Inventory item not found", 404);
    const { data, error } = await db.from("purchase_orders").insert({
      id: id("po"), property_id: user.propertyId, vendorid: body.vendorId, itemid: body.itemId, qty: asNumber(body.qty),
      unitcost: asNumber(item.costperunit), status: "Open", orderdate: today(user.timezone),
    }).select("*").single();
    if (error) throw error;
    return data;
  }
  const receivePoMatch = path.match(/^\/procurement\/purchase-orders\/([^/]+)\/receive$/);
  if (req.method === "POST" && receivePoMatch) {
    requireRole(user, "finance");
    const poId = decodeURIComponent(receivePoMatch[1]);
    const { data: order } = await db.from("purchase_orders").select("*")
      .eq("property_id", user.propertyId).eq("id", poId).maybeSingle();
    if (!order) throw fail("Purchase order not found", 404);
    if (order.status !== "Received") {
      const { data: item } = await db.from("inventory_items").select("*")
        .eq("property_id", user.propertyId).eq("id", order.itemid).maybeSingle();
      if (!item) throw fail("Inventory item not found", 404);
      await Promise.all([
        db.from("inventory_items").update({ onhand: asNumber(item.onhand) + asNumber(order.qty) })
          .eq("property_id", user.propertyId).eq("id", order.itemid),
        db.from("purchase_orders").update({ status: "Received" })
          .eq("property_id", user.propertyId).eq("id", poId),
      ]);
    }
    return { success: true };
  }
  const inventoryMatch = path.match(/^\/inventory\/items\/([^/]+)$/);
  if (req.method === "PATCH" && inventoryMatch) {
    requireRole(user, "finance");
    const { data, error } = await db.from("inventory_items").update({ onhand: asNumber(body.onHand) })
      .eq("property_id", user.propertyId).eq("id", decodeURIComponent(inventoryMatch[1])).select("*").single();
    if (error) throw error;
    return inventoryItem(data);
  }
  if (key === "GET /hr/employees") {
    requireRole(user, "manager");
    return (await rows("employees", user.propertyId, "name")).map(employee);
  }
  if (key === "GET /hr/shifts") {
    requireRole(user, "manager");
    const [shifts, employees] = await Promise.all([
      rows("shifts", user.propertyId, "date"),
      rows("employees", user.propertyId),
    ]);
    return shifts.map((r) => {
      const staff = employees.find((item) => item.id === r.employeeid);
      return {
        id: r.id, employeeName: staff?.name || r.employeeid, role: staff?.role || "",
        department: staff?.department || "", date: r.date,
        startTime: r.start_time, endTime: r.end_time, start: r.start_time, end: r.end_time,
      };
    });
  }
  if (key === "POST /hr/employees") {
    requireRole(user, "manager");
    const { data, error } = await db.from("employees").insert({
      id: id("emp"), property_id: user.propertyId, name: body.name, role: body.role, department: body.department,
      shift: body.shift, hourlyrate: asNumber(body.hourlyRate), status: "Active",
    }).select("*").single();
    if (error) throw error;
    return employee(data);
  }
  if (key === "POST /hr/shifts") {
    requireRole(user, "manager");
    const { data, error } = await db.from("shifts").insert({
      id: id("shift"), property_id: user.propertyId, employeeid: body.employeeId, date: body.date,
      start_time: body.start, end_time: body.end,
    }).select("*").single();
    if (error) throw error;
    return data;
  }
  if (key === "GET /gl/accounts") {
    requireRole(user, "finance");
    return (await rows("gl_accounts", user.propertyId, "code")).map((r) => ({ ...r, balance: 0 }));
  }
  if (key === "GET /gl/journal-entries") {
    requireRole(user, "finance");
    const [entries, lines, accounts] = await Promise.all([
      rows("journal_entries", user.propertyId, "date"),
      rows("journal_lines", user.propertyId),
      rows("gl_accounts", user.propertyId),
    ]);
    const asOf = url.searchParams.get("asOf");
    return entries.filter((entry) => !asOf || String(entry.date) <= asOf).map((entry) => {
      const entryLines = lines.filter((line) => line.entry_id === entry.id).map((line) => {
        const account = accounts.find((item) => item.id === line.account_id);
        return {
          id: line.id, accountId: line.account_id, accountCode: account?.code || "",
          accountName: account?.name || "", debit: asNumber(line.debit), credit: asNumber(line.credit),
        };
      });
      const first = entryLines[0];
      return {
        id: entry.id, date: entry.date, description: entry.description, source: entry.source,
        accountCode: first?.accountCode || "", accountName: first?.accountName || "",
        debit: entryLines.reduce((sum, line) => sum + line.debit, 0),
        credit: entryLines.reduce((sum, line) => sum + line.credit, 0), lines: entryLines,
      };
    });
  }
  if (key === "POST /gl/journal-entries") {
    requireRole(user, "finance");
    const lines = Array.isArray(body.lines) ? body.lines as Record<string, unknown>[] : [];
    const debit = lines.reduce((sum, line) => sum + asNumber(line.debit), 0);
    const credit = lines.reduce((sum, line) => sum + asNumber(line.credit), 0);
    if (lines.length < 2 || Math.abs(debit - credit) > 0.005 || debit <= 0) {
      throw fail("Journal entry must contain at least two balanced lines");
    }
    const entryId = id("je");
    const { error: entryError } = await db.from("journal_entries").insert({
      id: entryId, property_id: user.propertyId, date: body.date || today(user.timezone),
      description: body.description || "Manual journal entry",
      source: "Manual",
    });
    if (entryError) throw entryError;
    const { error: lineError } = await db.from("journal_lines").insert(lines.map((line) => ({
      id: id("jl"), property_id: user.propertyId, entry_id: entryId, account_id: line.accountId,
      debit: asNumber(line.debit), credit: asNumber(line.credit),
    })));
    if (lineError) throw lineError;
    return { id: entryId, success: true };
  }
  if (key === "POST /night-audit") {
    requireRole(user, "finance");
    const businessDate = today(user.timezone);
    const [reservations, postings] = await Promise.all([
      rows("reservations", user.propertyId), rows("night_audit_postings", user.propertyId),
    ]);
    const eligible = reservations.filter((r) =>
      r.status === "Checked-In" && String(r.checkin) <= businessDate && String(r.checkout) > businessDate
    );
    let foliosPosted = 0;
    let totalRoomRevenue = 0;
    for (const stay of eligible) {
      if (postings.some((posting) =>
        posting.business_date === businessDate && posting.reservation_id === stay.id
      )) continue;
      const roomCharge = Number((asNumber(stay.totalamount) / Math.max(1, asNumber(stay.nights))).toFixed(2));
      const folioId = id("f");
      const entryId = id("je");
      const { error: folioError } = await db.from("folio_items").insert({
        id: folioId, property_id: user.propertyId, reservation_id: stay.id, date: businessDate,
        description: `Room charge ${businessDate}`, category: "Room Charge",
        amount: roomCharge, postedby: user.name,
      });
      if (folioError) throw folioError;
      await Promise.all([
        db.from("journal_entries").insert({
          id: entryId, property_id: user.propertyId, date: businessDate, description: `Night audit ${stay.code}`, source: "Night Audit",
        }),
        db.from("night_audit_postings").insert({
          property_id: user.propertyId, business_date: businessDate, reservation_id: stay.id, folio_item_id: folioId,
          journal_entry_id: entryId, created_at: new Date().toISOString(),
        }),
      ]);
      foliosPosted += 1;
      totalRoomRevenue += roomCharge;
    }
    return {
      businessDate, foliosPosted, foliosSkipped: eligible.length - foliosPosted,
      totalRoomRevenue: Number(totalRoomRevenue.toFixed(2)),
    };
  }
  if (key === "GET /ai/anomalies") { requireRole(user, "finance"); return []; }
  if (key === "GET /ai/pricing-forecast") {
    requireRole(user, "finance");
    const rules = (await rows("pricing_rules", user.propertyId)).map(pricing);
    return rules.flatMap((r) => [1, 2, 3, 4, 5, 6, 7].map((offset) => {
      const date = new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
      return {
        roomType: r.roomType, date, predictedDemand: Math.round(55 + r.demandFactor * 20),
        recommendedPrice: r.recommendedRate, recommendedRate: r.recommendedRate,
        baseRate: r.baseRate, demandMultiplier: r.demandFactor,
        occupancyForecast: Math.min(98, Math.round(60 + offset * 2)),
        reasoning: ["Current configured demand factor", "Available room inventory"],
      };
    }));
  }
  if (key === "GET /ai/demand-forecast") {
    requireRole(user, "finance");
    return [1, 2, 3, 4, 5, 6, 7].map((offset) => ({
      date: new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10),
      occupancyPct: 0, demandIndex: 50, expectedOccupancy: 0, arrivals: 0,
    }));
  }
  if (key === "GET /ai/briefing") return {
    generatedAt: new Date().toISOString(), headline: "Operations are connected to Supabase.",
    summary: "Live hotel data is available. Activity recommendations will improve as reservations are recorded.",
    priorities: [], alerts: [], opportunities: [],
  };
  if (key === "POST /ai/copilot") return {
    answer: "The Supabase-backed operations service is online. Ask about rooms, reservations, arrivals, or occupancy.",
    actions: [], sources: ["Live NexusHOS database"],
  };
  if (key.startsWith("GET /workflows/")) return [];
  if (key === "GET /platform/webhooks" || key.startsWith("GET /platform/webhook-deliveries")) return [];
  if (key.startsWith("GET /platform/audit-events")) return key.endsWith("/verify")
    ? { valid: true, checked: 0, firstBrokenId: null }
    : { events: [], total: 0, limit: 100, offset: 0 };
  if (key === "GET /developer/events/catalog") return { events: [] };
  if (key === "GET /openapi.json") return openApiDocument;
  if (key === "GET /developer/status") return {
    service: "NexusHOS", status: "operational", database: "Supabase PostgreSQL",
    authentication: { type: "Supabase Auth", sessionTtlHours: 1 }, version: "3.0.0",
  };

  throw fail(`Not found: ${req.method} ${path}`, 404);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return json({}, 204, origin);
  if (origin && !allowedOrigins.has(origin)) return json({ error: "Origin not allowed" }, 403, origin);
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 65_536) return json({ error: "Request body is too large" }, 413, origin);
  const url = new URL(req.url);
  const marker = "/nexushos-api";
  const markerIndex = url.pathname.indexOf(marker);
  const path = (markerIndex >= 0 ? url.pathname.slice(markerIndex + marker.length) : url.pathname) || "/";
  try {
    const routeKey = `${req.method} ${path}`;
    const isPublic = publicPaths.has(routeKey);
    if (routeKey === "GET /booking/availability") {
      await enforceRateLimit(req, "booking-availability", 120, 60_000);
    } else if (routeKey === "POST /booking/quote") {
      await enforceRateLimit(req, "booking-quote", 30, 600_000);
    } else if (routeKey === "POST /booking/reservations") {
      await enforceRateLimit(req, "booking-reservation", 10, 600_000);
    }
    const user = isPublic ? null : await currentStaff(req);
    const result = await handle(req, path, url, user);
    return json(result, path === "/booking/reservations" && req.method === "POST" ? 201 : 200, origin);
  } catch (error) {
    console.error("nexushos-api", req.method, path, error);
    const status = Number.isInteger((error as { status?: number }).status)
      ? Number((error as { status: number }).status)
      : 500;
    const message = status >= 500 ? "Unexpected server error" : (error as Error).message;
    return json({ error: message }, status, origin);
  }
});
