import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

async function freshMigratedDatabase() {
  const database = new PGlite();
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create function public.rls_auto_enable()
    returns event_trigger
    language plpgsql
    as $$ begin end $$;
  `);

  const migrationDirectory = new URL('../supabase/migrations/', import.meta.url);
  const migrations = (await readdir(migrationDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const migration of migrations) {
    await database.exec(await readFile(new URL(migration, migrationDirectory), 'utf8'));
  }

  return database;
}

const isoDate = (offsetDays) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
};

test('Supabase migrations apply cleanly and enforce tenant keys', async () => {
  const database = await freshMigratedDatabase();
  try {
    const requiredTenantTables = [
      'rooms',
      'reservations',
      'folio_items',
      'housekeeping_tasks',
      'pricing_rules',
      'channels',
      'inventory_items',
      'employees',
      'journal_entries',
      'audit_events',
    ];
    const tenantColumns = await database.query(`
      select table_name
      from information_schema.columns
      where table_schema = 'nexushos'
        and column_name = 'property_id'
        and is_nullable = 'NO'
    `);
    const tenantTableNames = new Set(tenantColumns.rows.map((row) => row.table_name));
    for (const table of requiredTenantTables) {
      assert.ok(tenantTableNames.has(table), `${table} must have a non-null property_id`);
    }

    const limiter = await database.query(`
      select nexushos.consume_rate_limit('test', 'client', 1, 60000, 1000) as allowed
    `);
    assert.equal(limiter.rows[0].allowed, true);
    const blocked = await database.query(`
      select nexushos.consume_rate_limit('test', 'client', 1, 60000, 1001) as allowed
    `);
    assert.equal(blocked.rows[0].allowed, false);

    await database.exec(`
      insert into nexushos.reservations (
        id, property_id, code, roomnumber, checkin, checkout, status
      ) values (
        'tenant-test-1', 'prop-main', 'TENANT-1', '101',
        '2026-08-01', '2026-08-05', 'Confirmed'
      );
    `);
    await assert.rejects(
      database.exec(`
        insert into nexushos.reservations (
          id, property_id, code, roomnumber, checkin, checkout, status
        ) values (
          'tenant-test-2', 'prop-main', 'TENANT-2', '101',
          '2026-08-04', '2026-08-06', 'Confirmed'
        );
      `),
      /already reserved/,
    );
  } finally {
    await database.close();
  }
});

test('nexushos.property_metrics aggregates rooms, reservations, and folio charges in SQL', async () => {
  const database = await freshMigratedDatabase();
  try {
    const today = isoDate(0);

    await database.exec(`
      insert into nexushos.organizations (id, name, slug, created_at)
      values ('org-metrics-test', 'Metrics Test Org', 'metrics-test-org', now()::text);

      insert into nexushos.properties (
        id, organization_id, code, name, timezone, currency, locale, total_rooms, status, created_at
      ) values (
        'prop-metrics-test', 'org-metrics-test', 'MTX', 'Metrics Test Hotel',
        'UTC', 'USD', 'en-US', 4, 'Active', now()::text
      );
    `);

    await database.query(`
      insert into nexushos.rooms (id, property_id, number, type, floor, status, baseprice, currentprice, amenities)
      values
        ('room-mtx-101', 'prop-metrics-test', '101', 'Standard King', 1, 'Occupied', 150, 150, '[]'),
        ('room-mtx-102', 'prop-metrics-test', '102', 'Standard King', 1, 'Vacant Dirty', 150, 150, '[]'),
        ('room-mtx-103', 'prop-metrics-test', '103', 'Standard King', 1, 'Vacant Clean', 150, 150, '[]'),
        ('room-mtx-104', 'prop-metrics-test', '104', 'Standard King', 1, 'Out of Service', 150, 150, '[]');
    `);

    await database.query(
      `
      insert into nexushos.reservations (
        id, property_id, code, roomnumber, checkin, checkout, nights, guestscount, status
      ) values
        ('res-mtx-1', 'prop-metrics-test', 'MTX-1', '101', $1, $2, 4, 2, 'Checked-In'),
        ('res-mtx-2', 'prop-metrics-test', 'MTX-2', '103', $3, $4, 1, 1, 'Confirmed'),
        ('res-mtx-3', 'prop-metrics-test', 'MTX-3', '102', $5, $3, 3, 1, 'Confirmed'),
        ('res-mtx-4', 'prop-metrics-test', 'MTX-4', '104', $3, $4, 1, 1, 'Cancelled');
      `,
      [isoDate(-2), isoDate(2), today, isoDate(1), isoDate(-3)],
    );

    await database.query(`
      insert into nexushos.folio_items (id, property_id, reservation_id, date, description, category, amount)
      values
        ('folio-mtx-1', 'prop-metrics-test', 'res-mtx-1', $1, 'Room charge', 'Room Charge', 400),
        ('folio-mtx-2', 'prop-metrics-test', 'res-mtx-2', $1, 'Room charge', 'Room Charge', 100),
        ('folio-mtx-3', 'prop-metrics-test', 'res-mtx-1', $1, 'Minibar', 'Minibar', 25);
    `, [today]);

    const result = await database.query(`
      select * from nexushos.property_metrics('prop-metrics-test')
    `);
    assert.equal(result.rows.length, 1);
    const metrics = result.rows[0];

    // 3 sellable rooms (101/102/103), 1 occupied (101) -> 33.3%
    // PGlite returns `date` columns as JS Date objects; PostgREST (the
    // production caller) serializes the same column as a "YYYY-MM-DD" string.
    assert.equal(new Date(metrics.business_date).toISOString().slice(0, 10), today);
    assert.equal(Number(metrics.occupancy_rate), 33.3);
    // room revenue 500 / occupied nights (4 + 1 + 3 = 8) = 62.5
    assert.equal(Number(metrics.adr), 62.5);
    assert.equal(Number(metrics.rev_par), 20.81);
    assert.equal(Number(metrics.total_revenue), 525);
    assert.equal(Number(metrics.arrivals_today), 1);
    assert.equal(Number(metrics.departures_today), 1);
    assert.equal(Number(metrics.in_house_guests), 2);
    assert.equal(Number(metrics.dirty_rooms), 1);

    const unknownProperty = await database.query(`
      select * from nexushos.property_metrics('prop-does-not-exist')
    `);
    assert.equal(unknownProperty.rows.length, 1);
    assert.equal(Number(unknownProperty.rows[0].occupancy_rate), 0);
    assert.equal(Number(unknownProperty.rows[0].total_revenue), 0);
  } finally {
    await database.close();
  }
});
