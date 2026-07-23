import { workerData } from 'node:worker_threads';
import pg from 'pg';

const { Client } = pg;
pg.types.setTypeParser(20, Number);

const configuredUrl = process.env.NEXUSHOS_DATABASE_URL?.trim()
  || process.env.DATABASE_URL?.trim();

if (!configuredUrl) {
  throw new Error('NEXUSHOS_DATABASE_URL (or DATABASE_URL) is required');
}

const connectionString = configuredUrl.replace(/^postgresql\+asyncpg:/, 'postgresql:');
const schema = process.env.NEXUSHOS_DB_SCHEMA?.trim() || 'nexushos';
if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) {
  throw new Error('NEXUSHOS_DB_SCHEMA must be a safe lowercase PostgreSQL identifier');
}

const { port, startupSignal } = workerData;
const startup = new Int32Array(startupSignal);

let client;
let pglite = false;

async function secureSchemaAccess() {
  await client.query(`REVOKE ALL ON SCHEMA "${schema}" FROM PUBLIC`);
  await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA "${schema}" FROM PUBLIC`);
  await client.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA "${schema}" FROM PUBLIC`);
  await client.query(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "${schema}" FROM PUBLIC`);
  await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}" REVOKE ALL ON TABLES FROM PUBLIC`);
  await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}" REVOKE ALL ON SEQUENCES FROM PUBLIC`);
  await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}" REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`);
  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON SCHEMA "${schema}" FROM anon';
        EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA "${schema}" FROM anon';
        EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA "${schema}" FROM anon';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}" REVOKE ALL ON TABLES FROM anon';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}" REVOKE ALL ON SEQUENCES FROM anon';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON SCHEMA "${schema}" FROM authenticated';
        EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA "${schema}" FROM authenticated';
        EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA "${schema}" FROM authenticated';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}" REVOKE ALL ON TABLES FROM authenticated';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}" REVOKE ALL ON SEQUENCES FROM authenticated';
      END IF;
    END
    $$
  `);
}

try {
  if (connectionString.startsWith('pglite://')) {
    const { PGlite } = await import('@electric-sql/pglite');
    const location = connectionString.slice('pglite://'.length);
    client = new PGlite(location === 'memory' ? undefined : decodeURIComponent(location));
    await client.waitReady;
    pglite = true;
  } else {
    client = new Client({
      connectionString,
      application_name: 'nexushos',
      connectionTimeoutMillis: Number(process.env.NEXUSHOS_DB_CONNECTION_TIMEOUT_MS || 10_000),
      statement_timeout: Number(process.env.NEXUSHOS_DB_STATEMENT_TIMEOUT_MS || 30_000),
      query_timeout: Number(process.env.NEXUSHOS_DB_QUERY_TIMEOUT_MS || 30_000),
    });
    await client.connect();
  }
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await client.query(`SET search_path TO "${schema}", public`);
  await secureSchemaAccess();
  Atomics.store(startup, 0, 1);
  Atomics.notify(startup, 0);
} catch (error) {
  port.postMessage({
    id: 0,
    error: { message: error.message, code: error.code, detail: error.detail },
  });
  Atomics.store(startup, 0, -1);
  Atomics.notify(startup, 0);
}

const camelCaseColumns = new Map(Object.entries({
  actualcheckout: 'actualCheckOut',
  activelistings: 'activeListings',
  activesessioncount: 'activeSessionCount',
  assignedengineer: 'assignedEngineer',
  assignedto: 'assignedTo',
  autoapply: 'autoApply',
  baseprice: 'basePrice',
  baserate: 'baseRate',
  bookingsthismonth: 'bookingsThisMonth',
  checkin: 'checkIn',
  checkout: 'checkOut',
  commissionrate: 'commissionRate',
  contactlesscheckincompleted: 'contactlessCheckInCompleted',
  costperunit: 'costPerUnit',
  competitoravgrate: 'competitorAvgRate',
  currentguestname: 'currentGuestName',
  currentprice: 'currentPrice',
  demandfactor: 'demandFactor',
  dietarypreferences: 'dietaryPreferences',
  employeecount: 'employeeCount',
  employeeid: 'employeeId',
  etaminutes: 'etaMinutes',
  guestemail: 'guestEmail',
  guestname: 'guestName',
  guestphone: 'guestPhone',
  guestscount: 'guestsCount',
  hourlyrate: 'hourlyRate',
  itemid: 'itemId',
  issuedescription: 'issueDescription',
  laststaydate: 'lastStayDate',
  lastsync: 'lastSync',
  lifetimespend: 'lifetimeSpend',
  mustchangepassword: 'mustChangePassword',
  onhand: 'onHand',
  orderdate: 'orderDate',
  occupancytrigger: 'occupancyTrigger',
  paidamount: 'paidAmount',
  parlevel: 'parLevel',
  postedby: 'postedBy',
  preferredroomtype: 'preferredRoomType',
  recommendedrate: 'recommendedRate',
  reportedby: 'reportedBy',
  reportedtime: 'reportedTime',
  roomnumber: 'roomNumber',
  roomtype: 'roomType',
  safetycritical: 'safetyCritical',
  slaminutes: 'slaMinutes',
  specialrequests: 'specialRequests',
  start_time: 'start',
  statussince: 'status_since',
  synclatency: 'syncLatency',
  tasktype: 'taskType',
  totalamount: 'totalAmount',
  totalnights: 'totalNights',
  totalstays: 'totalStays',
  end_time: 'end',
  unitcost: 'unitCost',
  viptier: 'vipTier',
  vendorid: 'vendorId',
}));

const normalizeRow = (row) => {
  if (!row) return row;
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    result[camelCaseColumns.get(key) || key] = value;
  }
  return result;
};

function stripSqliteTriggers(sql) {
  return sql.replace(
    /CREATE\s+TRIGGER\s+IF\s+NOT\s+EXISTS[\s\S]*?\bEND\s*;/gi,
    '',
  );
}

function normalizeSql(sql) {
  let result = String(sql).trim();
  if (/^PRAGMA\s+(journal_mode|foreign_keys)\b/i.test(result)) return '';
  result = stripSqliteTriggers(result)
    .replace(/\)\s*STRICT\s*;/gi, ');')
    .replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, 'BIGSERIAL PRIMARY KEY')
    .replace(/\bCOLLATE\s+NOCASE\b/gi, '')
    .replace(/\bBEGIN\s+IMMEDIATE\b/gi, 'BEGIN')
    .replace(/\bMAX\s*\(\s*0\s*,/gi, 'GREATEST(0,')
    .replace(/\bAS\s+([a-z_][a-z0-9_]*[A-Z][A-Za-z0-9_]*)\b/g, 'AS "$1"')
    .replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');

  if (/^INSERT\s+/i.test(result)
    && /INSERT\s+OR\s+IGNORE\s+INTO/i.test(String(sql))
    && !/\bON\s+CONFLICT\b/i.test(result)) {
    result = `${result.replace(/;\s*$/, '')} ON CONFLICT DO NOTHING`;
  }
  return result;
}

function positionalSql(sql) {
  let output = '';
  let index = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const next = sql[i + 1];
    if (lineComment) {
      output += char;
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      output += char;
      if (char === '*' && next === '/') {
        output += next;
        i++;
        blockComment = false;
      }
      continue;
    }
    if (!quote && char === '-' && next === '-') {
      output += `${char}${next}`;
      i++;
      lineComment = true;
      continue;
    }
    if (!quote && char === '/' && next === '*') {
      output += `${char}${next}`;
      i++;
      blockComment = true;
      continue;
    }
    if (char === "'" || char === '"') {
      if (!quote) quote = char;
      else if (quote === char) {
        if (next === char) {
          output += `${char}${next}`;
          i++;
          continue;
        }
        quote = null;
      }
      output += char;
      continue;
    }
    if (!quote && char === '?') {
      output += `$${++index}`;
    } else {
      output += char;
    }
  }
  return output.replace(/(\$\d+)\s+IS\s+(NOT\s+)?NULL/gi, '$1::text IS $2NULL');
}

async function execute({ operation, sql, parameters = [] }) {
  if (operation === 'secure') {
    await secureSchemaAccess();
    return { rows: [], rowCount: 0 };
  }
  const pragma = String(sql).match(/^\s*PRAGMA\s+table_info\(([^)]+)\)/i);
  if (pragma) {
    const result = await client.query(`
      SELECT column_name AS name
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `, [schema, pragma[1].replace(/["']/g, '').trim().toLowerCase()]);
    return {
      rows: result.rows.map((row) => ({
        ...row,
        name: camelCaseColumns.get(row.name) || row.name,
      })),
    };
  }

  const normalized = normalizeSql(sql);
  if (!normalized) return { rows: [], rowCount: 0 };
  if (operation === 'exec' && pglite) {
    await client.exec(normalized);
    return { rows: [], rowCount: 0 };
  }
  const query = parameters.length ? positionalSql(normalized) : normalized;
  const result = await client.query(query, parameters);
  const rows = (result.rows || []).map(normalizeRow);
  if (operation === 'get') return { row: rows[0] || null };
  if (operation === 'all') return { rows };
  if (operation === 'run') {
    return {
      changes: result.rowCount ?? result.affectedRows ?? 0,
      lastInsertRowid: rows[0]?.sequence ?? null,
      rows,
    };
  }
  return { rows, rowCount: result.rowCount ?? result.affectedRows ?? 0 };
}

if (Atomics.load(startup, 0) === 1) {
  port.on('message', async (message) => {
    const signal = new Int32Array(message.signal);
    try {
      const result = await execute(message);
      port.postMessage({ id: message.id, result });
    } catch (error) {
      port.postMessage({
        id: message.id,
        error: {
          message: error.message,
          code: error.code,
          detail: error.detail,
          constraint: error.constraint,
        },
      });
    } finally {
      Atomics.store(signal, 0, 1);
      Atomics.notify(signal, 0);
    }
  });
}
