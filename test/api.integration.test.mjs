import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { contractedNightlyRate } from '../server/stay-pricing.js';

const root = fileURLToPath(new URL('../', import.meta.url));
let apiBase;
let apiProcess;
let tempDirectory;
let token;
let processOutput = '';

async function unusedPort() {
  const server = net.createServer();
  server.unref();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

async function queryIsolatedDatabase(databaseUrl, sql) {
  const child = spawn(process.execPath, ['-e', `
    import('./server/db.js').then(({ db }) => {
      const row = db.prepare(process.env.TEST_QUERY).get();
      console.log('TEST_QUERY_RESULT=' + JSON.stringify(row));
      db.close();
    }).catch((error) => { console.error(error); process.exitCode = 1; });
  `], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NEXUSHOS_SKIP_SEED: 'true',
      NEXUSHOS_DATABASE_URL: databaseUrl,
      TEST_QUERY: sql,
      NODE_NO_WARNINGS: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const [exitCode] = await once(child, 'exit');
  assert.equal(exitCode, 0, output);
  const encoded = output.split('\n').find((line) => line.startsWith('TEST_QUERY_RESULT='));
  assert.ok(encoded, output);
  return JSON.parse(encoded.slice('TEST_QUERY_RESULT='.length));
}

async function request(route, {
  method = 'GET', body, authenticated = false, bearerToken, headers: extraHeaders = {},
} = {}) {
  const response = await fetch(`${apiBase}${route}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(bearerToken || (authenticated && token)
        ? { Authorization: `Bearer ${bearerToken || token}` }
        : {}),
      ...extraHeaders,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}

async function loginAs(email, password) {
  const result = await request('/api/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  return result.data.token;
}

const addDays = (date, amount) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
};

async function waitForApi() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (apiProcess.exitCode !== null) {
      throw new Error(`API exited before becoming ready.\n${processOutput}`);
    }
    try {
      await fetch(`${apiBase}/api/health`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 75));
    }
  }
  throw new Error(`API did not become ready within 10 seconds.\n${processOutput}`);
}

async function auditCounts() {
  const reservationsResult = await request('/api/reservations', { authenticated: true });
  assert.equal(reservationsResult.response.status, 200);
  const folios = reservationsResult.data.flatMap((reservation) => reservation.folioItems || []);

  const journalsResult = await request('/api/gl/journal-entries', { authenticated: true });
  assert.equal(journalsResult.response.status, 200);
  return {
    folios: folios.filter((item) => item.postedBy === 'Night Audit').length,
    journals: journalsResult.data.filter((entry) => entry.source === 'Night Audit').length,
  };
}

describe('NexusHOS API integration', { concurrency: false }, () => {
  before(async () => {
    // Refuse to run against the developer database if isolation support is removed.
    const databaseSource = await readFile(path.join(root, 'server/db.js'), 'utf8');
    assert.match(databaseSource, /NEXUSHOS_DB_SCHEMA/, 'server/db.js must isolate the NexusHOS PostgreSQL schema');

    tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'nexushos-api-'));
    const databasePath = path.join(tempDirectory, 'hms-test-pg');
    const port = await unusedPort();
    apiBase = `http://127.0.0.1:${port}`;
    apiProcess = spawn(process.execPath, ['server/index.js'], {
      cwd: root,
      env: {
        ...process.env,
        NEXUSHOS_DATABASE_URL: `pglite://${databasePath}`,
        HMS_TRUST_PROXY: '',
        PORT: String(port),
        NODE_NO_WARNINGS: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    apiProcess.stdout.on('data', (chunk) => { processOutput += chunk; });
    apiProcess.stderr.on('data', (chunk) => { processOutput += chunk; });
    await waitForApi();

    const loginResult = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'gm@aura.com', password: 'admin123' },
    });
    assert.equal(loginResult.response.status, 200, processOutput);
    token = loginResult.data.token;
  });

  after(async () => {
    if (apiProcess && apiProcess.exitCode === null && apiProcess.signalCode === null) {
      const gracefulExit = once(apiProcess, 'exit').then(() => true);
      apiProcess.kill('SIGTERM');
      const stopped = await Promise.race([
        gracefulExit,
        new Promise((resolve) => setTimeout(() => resolve(false), 2_000)),
      ]);
      if (!stopped && apiProcess.exitCode === null && apiProcess.signalCode === null) {
        const forcedExit = once(apiProcess, 'exit');
        apiProcess.kill('SIGKILL');
        await forcedExit;
      }
    }
    if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true });
  });

  test('health is public and reports a ready service', async () => {
    const { response, data } = await request('/api/health');
    assert.equal(response.status, 200);
    assert.ok(data?.ok === true || data?.status === 'ok', `unexpected health response: ${JSON.stringify(data)}`);
    assert.match(String(response.headers.get('x-request-id')), /^[0-9a-f-]{36}$/i);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  });

  test('login rejects bad credentials and returns a usable bearer token', async () => {
    const rejected = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'gm@aura.com', password: 'wrong-password' },
    });
    assert.equal(rejected.response.status, 401);

    const accepted = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'frontdesk@aura.com', password: 'front123' },
    });
    assert.equal(accepted.response.status, 200);
    assert.equal(typeof accepted.data.token, 'string');
    assert.equal(accepted.data.user.email, 'frontdesk@aura.com');

    const unauthenticated = await request('/api/rooms');
    assert.equal(unauthenticated.response.status, 401);
    const authenticated = await request('/api/rooms', { bearerToken: accepted.data.token });
    assert.equal(authenticated.response.status, 200);
    assert.ok(Array.isArray(authenticated.data));

    const signedOut = await request('/api/auth/logout', {
      method: 'POST',
      bearerToken: accepted.data.token,
    });
    assert.equal(signedOut.response.status, 204);
    const afterLogout = await request('/api/rooms', { bearerToken: accepted.data.token });
    assert.equal(afterLogout.response.status, 401);
  });

  test('login throttling blocks repeated account guessing', async () => {
    for (let attempt = 1; attempt <= 10; attempt++) {
      const result = await request('/api/auth/login', {
        method: 'POST',
        body: { email: 'throttle-probe@example.com', password: 'not-a-real-password' },
        headers: { 'X-Forwarded-For': `203.0.113.${attempt}` },
      });
      assert.equal(result.response.status, 401, `attempt ${attempt}: ${JSON.stringify(result.data)}`);
    }
    const blocked = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'throttle-probe@example.com', password: 'not-a-real-password' },
      headers: { 'X-Forwarded-For': '198.51.100.77' },
    });
    assert.equal(blocked.response.status, 429);
    assert.ok(Number(blocked.response.headers.get('retry-after')) >= 1);
  });

  test('browser sessions use an HttpOnly cookie without exposing it to application storage', async () => {
    const signedIn = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'frontdesk@aura.com', password: 'front123' },
    });
    assert.equal(signedIn.response.status, 200);
    const setCookie = signedIn.response.headers.get('set-cookie');
    assert.match(String(setCookie), /nexushos_session=/);
    assert.match(String(setCookie), /HttpOnly/i);
    assert.match(String(setCookie), /SameSite=Strict/i);
    const cookie = String(setCookie).split(';')[0];

    const session = await request('/api/auth/session', { headers: { Cookie: cookie } });
    assert.equal(session.response.status, 200);
    assert.equal(session.data.user.email, 'frontdesk@aura.com');

    const rooms = await request('/api/rooms', { headers: { Cookie: cookie } });
    assert.equal(rooms.response.status, 200);
    assert.ok(Array.isArray(rooms.data));
  });

  test('account administration enforces temporary-password rotation and redaction', async () => {
    const financeToken = await loginAs('finance@aura.com', 'fin123');
    const financeDenied = await request('/api/admin/users', { bearerToken: financeToken });
    assert.equal(financeDenied.response.status, 403);

    const temporaryPassword = 'V8!Cobalt-River-Temporary';
    const created = await request('/api/admin/users', {
      method: 'POST',
      authenticated: true,
      body: {
        name: 'Release Operator',
        email: 'release.operator@example.com',
        role: 'Front Desk',
        password: temporaryPassword,
        propertyIds: ['prop-main'],
      },
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.data));
    assert.equal(created.data.mustChangePassword, true);
    assert.equal(created.data.active, true);
    assert.equal(JSON.stringify(created.data).includes('password'), false);

    const temporaryLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'release.operator@example.com', password: temporaryPassword },
    });
    assert.equal(temporaryLogin.response.status, 200, JSON.stringify(temporaryLogin.data));
    assert.equal(temporaryLogin.data.user.mustChangePassword, true);

    const gated = await request('/api/rooms', { bearerToken: temporaryLogin.data.token });
    assert.equal(gated.response.status, 403);
    assert.equal(gated.data.code, 'PASSWORD_CHANGE_REQUIRED');

    const nextPassword = 'R7!Quartz-Moon-Violet';
    const changed = await request('/api/auth/change-password', {
      method: 'POST',
      bearerToken: temporaryLogin.data.token,
      body: { currentPassword: temporaryPassword, newPassword: nextPassword },
    });
    assert.equal(changed.response.status, 200, JSON.stringify(changed.data));
    assert.equal(changed.data.user.mustChangePassword, false);

    const oldCredentials = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'release.operator@example.com', password: temporaryPassword },
    });
    assert.equal(oldCredentials.response.status, 401);
    const newCredentials = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'release.operator@example.com', password: nextPassword },
    });
    assert.equal(newCredentials.response.status, 200, JSON.stringify(newCredentials.data));
    assert.equal(newCredentials.data.user.mustChangePassword, false);

    const evidence = await request('/api/platform/audit-events?limit=200', { authenticated: true });
    assert.equal(evidence.response.status, 200, JSON.stringify(evidence.data));
    const actions = new Set(evidence.data.events.map((event) => event.action));
    assert.ok(actions.has('auth.login'));
    assert.ok(actions.has('auth.password.change'));
    assert.ok(actions.has('admin.user.created'));
  });

  test('developer discovery publishes a valid public contract and protects live readiness', async () => {
    const openApi = await request('/api/openapi.json');
    assert.equal(openApi.response.status, 200, JSON.stringify(openApi.data));
    assert.equal(openApi.data.openapi, '3.1.0');
    assert.ok(Object.keys(openApi.data.paths).length >= 10);
    const unauthenticated = await request('/api/developer/status');
    assert.equal(unauthenticated.response.status, 401);
    const status = await request('/api/developer/status', { authenticated: true });
    assert.equal(status.response.status, 200, JSON.stringify(status.data));
    assert.equal(status.data.openApi.ready, true);
    assert.ok(status.data.openApi.documentedOperations >= 35);
  });

  test('an empty production database never receives published demo credentials', async () => {
    const productionDatabase = path.join(tempDirectory, 'empty-production-pg');
    const productionDatabaseUrl = `pglite://${productionDatabase}`;
    const child = spawn(process.execPath, ['-e', "import('./server/db.js')"], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NEXUSHOS_DATABASE_URL: productionDatabaseUrl,
        NODE_NO_WARNINGS: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    const [exitCode] = await once(child, 'exit');
    assert.equal(exitCode, 0, output);
    assert.equal(
      (await queryIsolatedDatabase(productionDatabaseUrl, 'SELECT COUNT(*) AS count FROM users')).count,
      0,
    );

    const server = spawn(process.execPath, ['server/index.js'], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NEXUSHOS_DATABASE_URL: productionDatabaseUrl,
        HMS_ALLOWED_ORIGINS: 'https://hotel.example.com',
        NEXUSHOS_AUDIT_HMAC_SECRET: 'Aud1t-Zx9!Qp4#Lm7$Vr2%Cw8&Ks5*Ht3',
        NEXUSHOS_WEBHOOK_ENCRYPTION_KEY: 'Webh00k-Yt8@Mn3!Pc7#Rf2$Vx6%Bq9&Jd4',
        NEXUSHOS_RATE_LIMIT_PEPPER: 'Rate-L1m!t-Zq7@Ws3#Ed9$Rf5%Tg2&Yh8',
        NODE_NO_WARNINGS: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let serverOutput = '';
    server.stdout.on('data', (chunk) => { serverOutput += chunk; });
    server.stderr.on('data', (chunk) => { serverOutput += chunk; });
    const [serverExitCode] = await once(server, 'exit');
    assert.notEqual(serverExitCode, 0);
    assert.match(serverOutput, /no production administrator/i);

    const bootstrap = spawn(process.execPath, ['scripts/bootstrap-admin.mjs'], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NEXUSHOS_DATABASE_URL: productionDatabaseUrl,
        NEXUSHOS_BOOTSTRAP_ADMIN_EMAIL: 'initial.owner@example.com',
        NEXUSHOS_BOOTSTRAP_ADMIN_NAME: 'Bootstrap Owner',
        NEXUSHOS_BOOTSTRAP_ADMIN_PASSWORD: 'V8!Cobalt-River-Temporary',
        NEXUSHOS_BOOTSTRAP_PROPERTY_NAME: 'Production Test Hotel',
        NEXUSHOS_BOOTSTRAP_PROPERTY_CODE: 'PTH',
        NEXUSHOS_BOOTSTRAP_PROPERTY_TIMEZONE: 'Europe/Copenhagen',
        NEXUSHOS_BOOTSTRAP_PROPERTY_CURRENCY: 'DKK',
        NEXUSHOS_BOOTSTRAP_PROPERTY_ROOMS: '42',
        NODE_NO_WARNINGS: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let bootstrapOutput = '';
    bootstrap.stdout.on('data', (chunk) => { bootstrapOutput += chunk; });
    bootstrap.stderr.on('data', (chunk) => { bootstrapOutput += chunk; });
    const [bootstrapExitCode] = await once(bootstrap, 'exit');
    assert.equal(bootstrapExitCode, 0, bootstrapOutput);
    const bootstrapped = await queryIsolatedDatabase(
      productionDatabaseUrl,
      'SELECT email, role, active, must_change_password FROM users',
    );
    assert.deepEqual({
      email: bootstrapped.email,
      role: bootstrapped.role,
      active: Number(bootstrapped.active),
      mustChange: Number(bootstrapped.must_change_password),
    }, {
      email: 'initial.owner@example.com',
      role: 'General Manager',
      active: 1,
      mustChange: 1,
    });
    assert.equal(
      (await queryIsolatedDatabase(
        productionDatabaseUrl,
        'SELECT property_id FROM user_property_memberships',
      )).property_id,
      'prop-main',
    );
  });

  test('public direct booking holds a server quote, confirms once, and triggers frontline work', async () => {
    const metricResult = await request('/api/metrics', { authenticated: true });
    const checkIn = addDays(metricResult.data.businessDate, 35);
    const checkOut = addDays(checkIn, 2);
    const availability = await request(
      `/api/booking/availability?checkIn=${checkIn}&checkOut=${checkOut}&guests=2`,
    );
    assert.equal(availability.response.status, 200, JSON.stringify(availability.data));
    assert.ok(availability.data.roomTypes.length > 0);

    const roomType = availability.data.roomTypes[0];
    const quote = await request('/api/booking/quote', {
      method: 'POST',
      body: { checkIn, checkOut, guests: 2, roomType: roomType.roomType },
    });
    assert.equal(quote.response.status, 201, JSON.stringify(quote.data));
    assert.equal(quote.data.paymentDueNow, 0);
    assert.ok(quote.data.expiresAt);

    const idempotencyKey = `booking-${crypto.randomUUID()}`;
    const bookingBody = {
      quoteId: quote.data.quoteId,
      guest: {
        firstName: 'Direct', lastName: 'Guest', email: 'direct.guest@example.com', phone: '+45 1234 5678',
      },
      specialRequests: 'Step-free route requested',
      termsAccepted: true,
    };
    const confirmed = await request('/api/booking/reservations', {
      method: 'POST', body: bookingBody, headers: { 'Idempotency-Key': idempotencyKey },
    });
    assert.equal(confirmed.response.status, 201, JSON.stringify(confirmed.data));
    assert.match(confirmed.data.code, /^GH-\d{6}$/);

    const replay = await request('/api/booking/reservations', {
      method: 'POST', body: bookingBody, headers: { 'Idempotency-Key': idempotencyKey },
    });
    assert.equal(replay.response.status, 201);
    assert.equal(replay.data.reservationId, confirmed.data.reservationId);
    assert.equal(replay.response.headers.get('idempotent-replay'), 'true');

    const tasks = await request('/api/workflows/tasks?status=all', { authenticated: true });
    assert.equal(tasks.response.status, 200);
    assert.ok(tasks.data.some((task) => task.title.includes(confirmed.data.code)));
  });

  test('active group blocks hold room-type inventory and quoted bookings recheck it transactionally', async () => {
    const metrics = await request('/api/metrics', { authenticated: true });
    const checkIn = addDays(metrics.data.businessDate, 150);
    const checkOut = addDays(checkIn, 2);
    const before = await request(
      `/api/booking/availability?checkIn=${checkIn}&checkOut=${checkOut}&guests=1`,
    );
    assert.equal(before.response.status, 200, JSON.stringify(before.data));
    const availableRooms = before.data.roomTypes.reduce(
      (total, roomType) => total + roomType.availableCount,
      0,
    );
    assert.ok(availableRooms > 0);

    const quotedRoomType = before.data.roomTypes[0].roomType;
    const quote = await request('/api/booking/quote', {
      method: 'POST',
      body: { checkIn, checkOut, guests: 1, roomType: quotedRoomType },
    });
    assert.equal(quote.response.status, 201, JSON.stringify(quote.data));

    const group = await request('/api/groups', {
      method: 'POST',
      authenticated: true,
      body: {
        groupName: 'Full Inventory Control Test',
        companyName: 'Nexus Inventory Assurance',
        roomsAllocated: availableRooms,
        startDate: checkIn,
        endDate: checkOut,
        releaseDate: addDays(checkIn, -14),
        status: 'Definite Block',
        groupRate: 250,
        banquetCateringTotal: 0,
      },
    });
    assert.equal(group.response.status, 201, JSON.stringify(group.data));

    const held = await request(
      `/api/booking/availability?checkIn=${checkIn}&checkOut=${checkOut}&guests=1`,
    );
    assert.equal(held.response.status, 200);
    assert.deepEqual(held.data.roomTypes, []);

    const oversoldGroup = await request('/api/groups', {
      method: 'POST',
      authenticated: true,
      body: {
        groupName: 'Oversell Attempt',
        companyName: 'Nexus Inventory Assurance',
        roomsAllocated: 1,
        startDate: checkIn,
        endDate: checkOut,
        releaseDate: addDays(checkIn, -14),
        status: 'Tentative Hold',
        groupRate: 250,
        banquetCateringTotal: 0,
      },
    });
    assert.equal(oversoldGroup.response.status, 409, JSON.stringify(oversoldGroup.data));
    assert.match(oversoldGroup.data.error, /oversell inventory/i);

    const booking = await request('/api/booking/reservations', {
      method: 'POST',
      headers: { 'Idempotency-Key': `group-hold-${crypto.randomUUID()}` },
      body: {
        quoteId: quote.data.quoteId,
        guest: { firstName: 'Held', lastName: 'Inventory', email: 'held@example.com' },
        termsAccepted: true,
      },
    });
    assert.equal(booking.response.status, 409, JSON.stringify(booking.data));
    assert.match(booking.data.error, /inventory was just booked|another room/i);

    const released = await request(`/api/groups/${group.data.id}`, {
      method: 'PATCH', authenticated: true, body: { status: 'Released' },
    });
    assert.equal(released.response.status, 200, JSON.stringify(released.data));
    const afterRelease = await request(
      `/api/booking/availability?checkIn=${checkIn}&checkOut=${checkOut}&guests=1`,
    );
    assert.equal(afterRelease.response.status, 200);
    assert.ok(afterRelease.data.roomTypes.length > 0);
  });

  test('portfolio, group, reputation, and ESG records are persisted behind roles', async () => {
    const properties = await request('/api/portfolio/properties', { authenticated: true });
    assert.equal(properties.response.status, 200);
    assert.equal(properties.data.length, 3);
    assert.ok(properties.data.some((property) => property.source === 'Live PMS operations'));

    const metrics = await request('/api/metrics', { authenticated: true });
    const startDate = addDays(metrics.data.businessDate, 80);
    const endDate = addDays(startDate, 3);
    const group = await request('/api/groups', {
      method: 'POST',
      authenticated: true,
      body: {
        groupName: 'Integration Leadership Forum',
        companyName: 'Nexus Test Partners',
        contactEmail: 'events@example.com',
        roomsAllocated: 3,
        startDate,
        endDate,
        releaseDate: addDays(startDate, -14),
        status: 'Tentative Hold',
        groupRate: 275,
        banquetCateringTotal: 1800,
      },
    });
    assert.equal(group.response.status, 201, JSON.stringify(group.data));
    assert.equal(group.data.totalValue, 4275);

    const reviews = await request('/api/reputation/reviews', { authenticated: true });
    assert.equal(reviews.response.status, 200);
    const response = await request(`/api/reputation/reviews/${reviews.data[0].id}/respond`, {
      method: 'POST', authenticated: true, body: { responseText: 'Thank you for your thoughtful feedback.' },
    });
    assert.equal(response.response.status, 200);
    assert.equal(response.data.responded, true);
    assert.match(response.data.publication, /connector not configured/i);

    const esgAction = await request('/api/esg/actions/hvac-setback', {
      method: 'POST', authenticated: true, body: { target: 'Vacant rooms on floor 2' },
    });
    assert.equal(esgAction.response.status, 202);
    assert.equal(esgAction.data.status, 'Awaiting Provider');
  });

  test('workflow policy gates critical work and the platform audit chain verifies', async () => {
    const runKey = `workflow-client-${crypto.randomUUID()}`;
    const requested = await request('/api/workflows/templates/wf-safety-escalation/run', {
      method: 'POST',
      authenticated: true,
      body: {
        idempotencyKey: runKey,
        context: { roomNumber: '304', note: 'Smoke detector reported an unsafe state.' },
      },
    });
    assert.equal(requested.response.status, 202, JSON.stringify(requested.data));
    assert.equal(requested.data.status, 'Awaiting Approval');
    assert.equal(requested.data.tasks.length, 0);

    const approved = await request(`/api/workflows/runs/${requested.data.id}/approve`, {
      method: 'POST', authenticated: true,
    });
    assert.equal(approved.response.status, 200);
    assert.equal(approved.data.status, 'Completed');
    assert.equal(approved.data.tasks.length, 1);

    const audit = await request('/api/platform/audit-events?limit=20', { authenticated: true });
    assert.equal(audit.response.status, 200);
    assert.ok(audit.data.events.length > 0);
    const verified = await request('/api/platform/audit-events/verify', { authenticated: true });
    assert.equal(verified.response.status, 200);
    assert.equal(verified.data.valid, true, JSON.stringify(verified.data));
  });

  test('role matrix protects sensitive hotel and ERP data', async () => {
    const housekeepingToken = await loginAs('house@aura.com', 'house123');
    const housekeeping = await request('/api/housekeeping', { bearerToken: housekeepingToken });
    assert.equal(housekeeping.response.status, 200);
    const housekeepingRooms = await request('/api/rooms', { bearerToken: housekeepingToken });
    assert.equal(housekeepingRooms.response.status, 200);
    assert.ok(housekeepingRooms.data.every((room) => !Object.hasOwn(room, 'basePrice')
      && !Object.hasOwn(room, 'currentPrice')));
    const guestData = await request('/api/reservations', { bearerToken: housekeepingToken });
    assert.equal(guestData.response.status, 403);
    const demandData = await request('/api/ai/demand-forecast', { bearerToken: housekeepingToken });
    assert.equal(demandData.response.status, 403);
    const operationalMetrics = await request('/api/metrics', { bearerToken: housekeepingToken });
    assert.equal(operationalMetrics.response.status, 200);
    assert.equal(operationalMetrics.data.financialMetricsAvailable, false);
    assert.equal(operationalMetrics.data.adr, 0);
    assert.equal(operationalMetrics.data.revPar, 0);
    assert.equal(operationalMetrics.data.totalRevenue, 0);
    const restrictedCopilot = await request('/api/ai/copilot', {
      method: 'POST',
      bearerToken: housekeepingToken,
      body: { message: 'What is ADR and RevPAR?' },
    });
    assert.equal(restrictedCopilot.response.status, 200);
    assert.match(restrictedCopilot.data.reply, /restricted|finance|general manager/i);

    const maintenanceBefore = await request('/api/maintenance', { bearerToken: housekeepingToken });
    const maintenanceRequestId = `maint-client-${crypto.randomUUID()}`;
    const maintenancePayload = {
      requestId: maintenanceRequestId,
      roomNumber: '103',
      issueDescription: 'Idempotent test ticket',
      category: 'Electrical',
      priority: 'Normal',
    };
    const maintenanceFirst = await request('/api/maintenance', {
      method: 'POST', bearerToken: housekeepingToken, body: maintenancePayload,
    });
    assert.equal(maintenanceFirst.response.status, 201);
    const maintenanceRetry = await request('/api/maintenance', {
      method: 'POST', bearerToken: housekeepingToken, body: maintenancePayload,
    });
    assert.equal(maintenanceRetry.response.status, 200);
    assert.equal(maintenanceRetry.data.deduplicated, true);
    const maintenanceAfter = await request('/api/maintenance', { bearerToken: housekeepingToken });
    assert.equal(maintenanceAfter.data.length, maintenanceBefore.data.length + 1);

    const financeToken = await loginAs('finance@aura.com', 'fin123');
    const ledger = await request('/api/gl/journal-entries', { bearerToken: financeToken });
    assert.equal(ledger.response.status, 200);
    const financeMetrics = await request('/api/metrics', { bearerToken: financeToken });
    assert.equal(financeMetrics.data.financialMetricsAvailable, true);
    const financeRooms = await request('/api/rooms', { bearerToken: financeToken });
    assert.ok(financeRooms.data.every((room) => typeof room.currentPrice === 'number'));
    const financeDemand = await request('/api/ai/demand-forecast', { bearerToken: financeToken });
    assert.equal(financeDemand.response.status, 200);
    assert.ok(financeDemand.data.every((day) => Number.isFinite(day.expectedOccupancy)
      && day.expectedOccupancy >= 0 && day.expectedOccupancy <= 100));
    const employees = await request('/api/hr/employees', { bearerToken: financeToken });
    assert.equal(employees.response.status, 403);
    const createReservation = await request('/api/reservations', {
      method: 'POST',
      bearerToken: financeToken,
      body: { guestName: 'Unauthorized', roomNumber: '102', checkIn: '2035-01-01', checkOut: '2035-01-02' },
    });
    assert.equal(createReservation.response.status, 403);
  });

  test('reservation creation validates dates and rejects room overlaps', async () => {
    const invalid = await request('/api/reservations', {
      method: 'POST',
      authenticated: true,
      body: {
        guestName: 'Invalid Date Guest',
        roomNumber: '102',
        checkIn: '2035-04-14',
        checkOut: '2035-04-14',
      },
    });
    assert.equal(invalid.response.status, 400);

    const rawFolio = await request('/api/reservations', {
      method: 'POST',
      authenticated: true,
      body: {
        guestName: 'Raw Folio Attempt',
        roomNumber: '302',
        checkIn: '2035-05-01',
        checkOut: '2035-05-02',
        folioItems: [{ description: 'Revenue reversal', category: 'Room Charge', amount: -500 }],
      },
    });
    assert.equal(rawFolio.response.status, 400);

    const first = await request('/api/reservations', {
      method: 'POST',
      authenticated: true,
      body: {
        guestName: 'Integration Test Guest',
        roomNumber: '102',
        checkIn: '2035-04-14',
        checkOut: '2035-04-17',
        totalAmount: 600,
        paymentAmount: 672,
      },
    });
    assert.equal(first.response.status, 201, JSON.stringify(first.data));

    const overlap = await request('/api/reservations', {
      method: 'POST',
      authenticated: true,
      body: {
        guestName: 'Overlapping Test Guest',
        roomNumber: '102',
        checkIn: '2035-04-16',
        checkOut: '2035-04-18',
      },
    });
    assert.equal(overlap.response.status, 409);
    assert.match(String(overlap.data?.error), /overlap|unavailable|booked/i);

    const earlyCheckIn = await request(`/api/reservations/${first.data.id}/check-in`, {
      method: 'POST',
      authenticated: true,
    });
    assert.equal(earlyCheckIn.response.status, 409);
    assert.match(String(earlyCheckIn.data?.error), /before|check-in/i);

    const overflowCharge = await request(`/api/reservations/${first.data.id}/folio-items`, {
      method: 'POST',
      authenticated: true,
      body: { description: 'Overflow attempt', category: 'Other Income', amount: Number.MAX_VALUE },
    });
    assert.equal(overflowCharge.response.status, 400);
    assert.match(String(overflowCharge.data?.error), /currency range|amount/i);

    const cancelled = await request(`/api/reservations/${first.data.id}/cancel`, {
      method: 'POST',
      authenticated: true,
    });
    assert.equal(cancelled.response.status, 200);
    assert.equal(cancelled.data.status, 'Cancelled');
    assert.equal(cancelled.data.paidAmount, 0);
    assert.equal(+cancelled.data.folioItems.reduce((sum, item) => sum + item.amount, 0).toFixed(2), 0);
    assert.ok(cancelled.data.folioItems.some((item) => item.postedBy === 'Cancellation'));
    const closedFolioWrite = await request(`/api/reservations/${first.data.id}/folio-items`, {
      method: 'POST',
      authenticated: true,
      body: { description: 'Should be rejected', category: 'Other Income', amount: 10 },
    });
    assert.equal(closedFolioWrite.response.status, 409);

    const reopened = await request('/api/reservations', {
      method: 'POST',
      authenticated: true,
      body: {
        guestName: 'Replacement Guest',
        roomNumber: '102',
        checkIn: '2035-04-14',
        checkOut: '2035-04-17',
      },
    });
    assert.equal(reopened.response.status, 201, JSON.stringify(reopened.data));
    assert.match(reopened.data.code, /^GH-\d{6}$/);
    const allReservations = await request('/api/reservations', { authenticated: true });
    const codes = allReservations.data.map((reservation) => reservation.code);
    assert.equal(new Set(codes).size, codes.length, 'reservation confirmation codes must be unique');
  });

  test('arrival-day reservations use the explicit no-show workflow', async () => {
    const metrics = await request('/api/metrics', { authenticated: true });
    const businessDate = metrics.data.businessDate;
    const created = await request('/api/reservations', {
      method: 'POST',
      authenticated: true,
      body: {
        guestName: 'No Show Policy Guest',
        roomNumber: '202',
        checkIn: businessDate,
        checkOut: addDays(businessDate, 1),
        paymentAmount: 392,
      },
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.data));

    const cancellation = await request(`/api/reservations/${created.data.id}/cancel`, {
      method: 'POST',
      authenticated: true,
    });
    assert.equal(cancellation.response.status, 409);
    assert.match(String(cancellation.data?.error), /no-show|arrival/i);

    const noShow = await request(`/api/reservations/${created.data.id}/no-show`, {
      method: 'POST',
      authenticated: true,
    });
    assert.equal(noShow.response.status, 200, JSON.stringify(noShow.data));
    assert.equal(noShow.data.status, 'No-Show');
    assert.equal(+noShow.data.folioItems.reduce((sum, item) => sum + item.amount, 0).toFixed(2), 0);
    assert.ok(noShow.data.folioItems.some((item) => item.postedBy === 'No-Show'));

    const rooms = await request('/api/rooms', { authenticated: true });
    assert.equal(rooms.data.find((room) => room.number === '202').status, 'Vacant Clean');
  });

  test('checkout rejects both outstanding charges and unrefunded credits', async () => {
    const prematureRefund = await request('/api/reservations/res-203/folio-items', {
      method: 'POST',
      authenticated: true,
      body: { description: 'Premature deposit refund', category: 'Payment', amount: 100 },
    });
    assert.equal(prematureRefund.response.status, 409);
    assert.match(String(prematureRefund.data?.error), /contracted room charges|refund/i);

    const creditCheckout = await request('/api/reservations/res-101/check-out', {
      method: 'POST',
      authenticated: true,
    });
    assert.equal(creditCheckout.response.status, 409);
    assert.match(String(creditCheckout.data?.error), /zero|folio|balance/i);
    const afterCreditCheckout = await request('/api/reservations', { authenticated: true });
    const seededStay = afterCreditCheckout.data.find((reservation) => reservation.id === 'res-101');
    assert.equal(
      seededStay.folioItems.filter((item) => item.category === 'Room Charge' && item.date === seededStay.checkIn).length,
      1,
      'checkout catch-up must not duplicate a seeded first-night room charge',
    );

    const charge = await request('/api/reservations/res-104/folio-items', {
      method: 'POST',
      authenticated: true,
      body: { description: 'Settlement guard test', category: 'Other Income', amount: 500 },
    });
    assert.equal(charge.response.status, 200);
    const positiveCheckout = await request('/api/reservations/res-104/check-out', {
      method: 'POST',
      authenticated: true,
    });
    assert.equal(positiveCheckout.response.status, 409);

    const metrics = await request('/api/metrics', { authenticated: true });
    const sameDay = await request('/api/reservations', {
      method: 'POST',
      authenticated: true,
      body: {
        guestName: 'Checkout Revenue Guard',
        roomNumber: '302',
        checkIn: metrics.data.businessDate,
        checkOut: addDays(metrics.data.businessDate, 1),
        paymentAmount: 69.6,
      },
    });
    assert.equal(sameDay.response.status, 201, JSON.stringify(sameDay.data));
    const checkIn = await request(`/api/reservations/${sameDay.data.id}/check-in`, {
      method: 'POST',
      authenticated: true,
    });
    assert.equal(checkIn.response.status, 200);
    const guardedCheckout = await request(`/api/reservations/${sameDay.data.id}/check-out`, {
      method: 'POST',
      authenticated: true,
    });
    assert.equal(guardedCheckout.response.status, 409);
    assert.equal(guardedCheckout.data.roomNightsPosted, 1);
    const reservations = await request('/api/reservations', { authenticated: true });
    const guardedStay = reservations.data.find((reservation) => reservation.id === sameDay.data.id);
    assert.ok(guardedStay.folioItems.some((item) => item.postedBy === 'Checkout'));
    assert.ok(guardedStay.folioItems.reduce((sum, item) => sum + item.amount, 0) > 0);
  });

  test('early checkout enforces the full contract and records the actual departure', async () => {
    const before = await request('/api/metrics', { authenticated: true });
    const businessDate = before.data.businessDate;
    const created = await request('/api/reservations', {
      method: 'POST',
      authenticated: true,
      body: {
        guestName: 'Early Departure Contract Guest',
        roomNumber: '201',
        checkIn: businessDate,
        checkOut: addDays(businessDate, 3),
        paymentAmount: 1176,
      },
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.data));
    assert.equal(created.data.totalAmount, 1050);

    const checkIn = await request(`/api/reservations/${created.data.id}/check-in`, {
      method: 'POST',
      authenticated: true,
    });
    assert.equal(checkIn.response.status, 200);

    const checkOut = await request(`/api/reservations/${created.data.id}/check-out`, {
      method: 'POST',
      authenticated: true,
    });
    assert.equal(checkOut.response.status, 200, JSON.stringify(checkOut.data));
    assert.equal(checkOut.data.status, 'Checked-Out');
    assert.equal(checkOut.data.actualCheckOut, businessDate);
    assert.equal(
      +checkOut.data.folioItems
        .filter((item) => item.category === 'Room Charge')
        .reduce((sum, item) => sum + item.amount, 0)
        .toFixed(2),
      1050,
    );
    const earlyDepartureLines = checkOut.data.folioItems.filter((item) => item.description.includes('Early departure'));
    assert.equal(earlyDepartureLines.length, 2);
    assert.ok(earlyDepartureLines.every((item) => item.date === businessDate));

    const after = await request('/api/metrics', { authenticated: true });
    assert.ok(after.data.departuresToday >= before.data.departuresToday + 1);
  });

  test('POS retries are idempotent and projected deposits are not false anomalies', async () => {
    const before = await request('/api/pos-charges', { authenticated: true });
    const requestId = `pos-client-${crypto.randomUUID()}`;
    const payload = {
      requestId,
      roomNumber: '203',
      outlet: 'In-Room Dining',
      items: [{ name: 'Idempotency Test Breakfast', price: 42.5, qty: 1 }],
    };
    const first = await request('/api/pos-charges', {
      method: 'POST',
      authenticated: true,
      body: payload,
    });
    assert.equal(first.response.status, 201, JSON.stringify(first.data));
    assert.equal(first.data.charge.id, requestId);

    const retry = await request('/api/pos-charges', {
      method: 'POST',
      authenticated: true,
      body: payload,
    });
    assert.equal(retry.response.status, 200, JSON.stringify(retry.data));
    assert.equal(retry.data.deduplicated, true);

    const after = await request('/api/pos-charges', { authenticated: true });
    assert.equal(after.data.length, before.data.length + 1);
    assert.equal(after.data.filter((charge) => charge.id === requestId).length, 1);

    const anomalies = await request('/api/ai/anomalies', { authenticated: true });
    assert.equal(anomalies.response.status, 200);
    assert.ok(
      !anomalies.data.some((finding) => /projected checkout credit/i.test(finding.message)),
      JSON.stringify(anomalies.data),
    );
  });

  test('receiving inventory posts a balanced Inventory/AP journal once', async () => {
    const inventoryBefore = await request('/api/inventory/items', { authenticated: true });
    const itemBefore = inventoryBefore.data.find((item) => item.id === 'inv-1');
    const created = await request('/api/procurement/purchase-orders', {
      method: 'POST',
      authenticated: true,
      body: { vendorId: 'ven-1', itemId: 'inv-1', qty: 2, unitCost: 10 },
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.data));

    const received = await request(`/api/procurement/purchase-orders/${created.data.id}/receive`, {
      method: 'POST',
      authenticated: true,
    });
    assert.equal(received.response.status, 200, JSON.stringify(received.data));
    assert.equal(received.data.receiptAmount, 20);
    assert.equal(received.data.item.onHand, itemBefore.onHand + 2);
    assert.equal(typeof received.data.journalEntryId, 'string');

    const duplicateReceive = await request(`/api/procurement/purchase-orders/${created.data.id}/receive`, {
      method: 'POST',
      authenticated: true,
    });
    assert.equal(duplicateReceive.response.status, 409);

    const ledger = await request('/api/gl/journal-entries', { authenticated: true });
    const entry = ledger.data.find((journal) => journal.id === received.data.journalEntryId);
    assert.equal(entry.source, 'Procurement Receipt');
    assert.ok(entry.lines.some((line) => line.accountId === 'gl-1200' && line.debit === 20));
    assert.ok(entry.lines.some((line) => line.accountId === 'gl-2000' && line.credit === 20));
  });

  test('seeded folios are represented in the live general ledger', async () => {
    const entries = await request('/api/gl/journal-entries', { authenticated: true });
    assert.equal(entries.response.status, 200);
    assert.ok(entries.data.some((entry) => entry.source === 'Guest Folio'));
    for (const entry of entries.data) {
      const debit = entry.lines.reduce((sum, line) => sum + line.debit, 0);
      const credit = entry.lines.reduce((sum, line) => sum + line.credit, 0);
      assert.ok(Math.abs(debit - credit) <= 0.005, `unbalanced entry ${entry.id}`);
    }
    const metrics = await request('/api/metrics', { authenticated: true });
    const asOf = await request(`/api/gl/journal-entries?asOf=${metrics.data.businessDate}`, { authenticated: true });
    assert.equal(asOf.response.status, 200);
    assert.ok(asOf.data.every((entry) => entry.date <= metrics.data.businessDate));
    assert.ok(entries.data.some((entry) => entry.date > metrics.data.businessDate));
    const invalidAsOf = await request('/api/gl/journal-entries?asOf=not-a-date', { authenticated: true });
    assert.equal(invalidAsOf.response.status, 400);
  });

  test('contracted nightly allocation distributes exact cents', () => {
    const reservation = { checkIn: '2035-06-01', nights: 3, totalAmount: 100 };
    const nightly = [0, 1, 2].map((offset) => contractedNightlyRate(
      reservation,
      addDays(reservation.checkIn, offset),
    ));
    assert.deepEqual(nightly, [33.34, 33.33, 33.33]);
    assert.equal(+nightly.reduce((sum, amount) => sum + amount, 0).toFixed(2), 100);
  });

  test('night audit posts current contracted cents and rejects future dates', async () => {
    const metrics = await request('/api/metrics', { authenticated: true });
    const businessDate = metrics.data.businessDate;
    const created = await request('/api/reservations', {
      method: 'POST',
      authenticated: true,
      body: {
        guestName: 'Cent Distribution Guest',
        roomNumber: '202',
        checkIn: businessDate,
        checkOut: addDays(businessDate, 3),
        totalAmount: 100,
      },
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.data));
    const checkedIn = await request(`/api/reservations/${created.data.id}/check-in`, {
      method: 'POST',
      authenticated: true,
    });
    assert.equal(checkedIn.response.status, 200, JSON.stringify(checkedIn.data));

    const audit = await request('/api/night-audit', {
      method: 'POST',
      authenticated: true,
      body: { businessDate },
    });
    assert.equal(audit.response.status, 200, JSON.stringify(audit.data));
    const futureAudit = await request('/api/night-audit', {
      method: 'POST',
      authenticated: true,
      body: { businessDate: addDays(businessDate, 1) },
    });
    assert.equal(futureAudit.response.status, 400);
    const reservations = await request('/api/reservations', { authenticated: true });
    const updated = reservations.data.find((reservation) => reservation.id === created.data.id);
    const nightly = updated.folioItems
      .filter((item) => item.postedBy === 'Night Audit')
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item) => item.amount);
    assert.deepEqual(nightly, [33.34]);
  });

  test('copilot preserves its reply/actions response contract', async () => {
    const empty = await request('/api/ai/copilot', {
      method: 'POST',
      authenticated: true,
      body: { message: '' },
    });
    assert.equal(empty.response.status, 400);

    const result = await request('/api/ai/copilot', {
      method: 'POST',
      authenticated: true,
      body: { message: 'What is occupancy today?' },
    });
    assert.equal(result.response.status, 200);
    assert.equal(typeof result.data.reply, 'string');
    assert.match(result.data.reply, /occupancy/i);
    assert.ok(Array.isArray(result.data.actions));

    for (const [guestName, roomNumber] of [['John Alpha', '201'], ['John Beta', '301']]) {
      const created = await request('/api/reservations', {
        method: 'POST',
        authenticated: true,
        body: { guestName, roomNumber, checkIn: '2036-01-10', checkOut: '2036-01-11' },
      });
      assert.equal(created.response.status, 201, JSON.stringify(created.data));
    }
    const ambiguous = await request('/api/ai/copilot', {
      method: 'POST',
      authenticated: true,
      body: { message: 'check in John' },
    });
    assert.equal(ambiguous.response.status, 200);
    assert.match(ambiguous.data.reply, /multiple|exact reservation code/i);
    assert.deepEqual(ambiguous.data.actions, []);

    const preview = await request('/api/ai/copilot', {
      method: 'POST',
      authenticated: true,
      body: { message: 'clean floor 1', confirmActions: false },
    });
    assert.equal(preview.response.status, 200);
    assert.equal(preview.data.requiresConfirmation, true);
    assert.ok(Array.isArray(preview.data.proposedActions));
    assert.ok(preview.data.proposedActions.length > 0);
    assert.deepEqual(preview.data.actions, []);
  });

  test('AI briefing is role-safe and available without an external model', async () => {
    const briefing = await request('/api/ai/briefing', { authenticated: true });
    assert.equal(briefing.response.status, 200, JSON.stringify(briefing.data));
    assert.equal(typeof briefing.data.summary, 'string');
    assert.ok(Array.isArray(briefing.data.priorities));
    assert.ok(Array.isArray(briefing.data.opportunities));
    assert.match(briefing.data.generatedBy, /^(openai|rules)$/);

    const housekeepingToken = await loginAs('house@aura.com', 'house123');
    const housekeepingBriefing = await request('/api/ai/briefing', { bearerToken: housekeepingToken });
    assert.equal(housekeepingBriefing.response.status, 200, JSON.stringify(housekeepingBriefing.data));
    assert.doesNotMatch(JSON.stringify(housekeepingBriefing.data), /\bADR\b|\bRevPAR\b/i);
  });

  test('night audit is idempotent for the same business date', async () => {
    const beforeCounts = await auditCounts();
    const first = await request('/api/night-audit', { method: 'POST', authenticated: true });
    assert.equal(first.response.status, 200);
    const afterFirst = await auditCounts();
    assert.ok(afterFirst.folios >= beforeCounts.folios);
    assert.ok(afterFirst.journals >= beforeCounts.journals);

    const second = await request('/api/night-audit', { method: 'POST', authenticated: true });
    assert.equal(second.response.status, 200);
    const afterSecond = await auditCounts();
    assert.deepEqual(afterSecond, afterFirst, 'a repeated audit must not add folios or journal entries');

    const reportsNoNewPosts = second.data?.foliosPosted === 0
      || Number(second.data?.foliosSkipped) > 0
      || second.data?.alreadyRan === true
      || second.data?.skipped === true;
    assert.ok(reportsNoNewPosts, `repeat response should report skipped work: ${JSON.stringify(second.data)}`);
  });
});
