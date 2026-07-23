import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('Supabase migrations apply cleanly and enforce tenant keys', async () => {
  const database = new PGlite();
  try {
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
