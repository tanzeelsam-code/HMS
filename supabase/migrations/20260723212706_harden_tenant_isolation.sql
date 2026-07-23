-- Corrective tenant-isolation migration.
--
-- The preceding migration added property_id to only a subset of operational
-- tables and left the columns nullable/defaulted to prop-main.  The Edge
-- Function uses service_role (which bypasses RLS), so every tenant-owned row
-- must carry a property_id and every request must explicitly scope queries.

set search_path to nexushos, public;

alter table nexushos.users
  add column if not exists auth_invalid_before bigint not null default 0;

do $$
declare
  table_name text;
  tenant_tables constant text[] := array[
    'rooms',
    'reservations',
    'folio_items',
    'housekeeping_tasks',
    'pricing_rules',
    'channels',
    'pos_charges',
    'guest_profiles',
    'maintenance_orders',
    'gl_accounts',
    'journal_entries',
    'journal_lines',
    'inventory_items',
    'vendors',
    'purchase_orders',
    'employees',
    'shifts',
    'night_audit_postings',
    'folio_journal_postings',
    'group_bookings',
    'group_room_blocks',
    'reputation_reviews',
    'esg_metrics',
    'esg_actions',
    'booking_quotes',
    'booking_idempotency',
    'workflow_templates',
    'workflow_runs',
    'workflow_tasks',
    'workflow_audit_events',
    'workflow_event_outbox',
    'webhook_subscriptions',
    'webhook_events',
    'webhook_delivery_attempts',
    'audit_events'
  ];
begin
  foreach table_name in array tenant_tables loop
    -- A temporary default backfills existing rows without firing append-only
    -- UPDATE triggers on audit_events and webhook_events.
    execute format(
      'alter table nexushos.%I add column if not exists property_id text default %L',
      table_name,
      'prop-main'
    );

    if table_name not in ('audit_events', 'webhook_events') then
      execute format(
        'update nexushos.%I set property_id = %L where property_id is null',
        table_name,
        'prop-main'
      );
    end if;

    execute format(
      'alter table nexushos.%I alter column property_id set not null',
      table_name
    );
    execute format(
      'alter table nexushos.%I alter column property_id drop default',
      table_name
    );
    execute format(
      'create index if not exists %I on nexushos.%I (property_id)',
      'idx_' || table_name || '_property_id',
      table_name
    );

    if not exists (
      select 1
      from pg_constraint
      where conname = table_name || '_property_id_fkey'
        and conrelid = format('nexushos.%I', table_name)::regclass
    ) then
      execute format(
        'alter table nexushos.%I add constraint %I foreign key (property_id) references nexushos.properties(id) not valid',
        table_name,
        table_name || '_property_id_fkey'
      );
      execute format(
        'alter table nexushos.%I validate constraint %I',
        table_name,
        table_name || '_property_id_fkey'
      );
    end if;

    -- Direct browser roles remain unable to query the private schema. RLS is
    -- enabled as defense in depth in case a future grant exposes a table.
    execute format('alter table nexushos.%I enable row level security', table_name);
  end loop;
end;
$$;

-- Room numbers and reservation codes are unique within a hotel, not across
-- every customer on the platform.
alter table nexushos.rooms drop constraint if exists rooms_number_key;
drop index if exists nexushos.idx_reservations_code_unique;

create unique index if not exists idx_rooms_property_number_unique
  on nexushos.rooms(property_id, number);
create unique index if not exists idx_reservations_property_code_unique
  on nexushos.reservations(property_id, code);

-- Serialize writes for the same room and reject overlapping active stays.
-- The Edge Function cannot wrap multiple PostgREST requests in one transaction,
-- so this database guard is the final authority against double-booking races.
create or replace function nexushos.enforce_reservation_availability()
returns trigger
language plpgsql
security invoker
set search_path = nexushos, pg_temp
as $$
begin
  if new.status not in ('Confirmed', 'Checked-In') then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.property_id || ':' || new.roomnumber, 0)
  );

  if exists (
    select 1
    from nexushos.reservations existing
    where existing.property_id = new.property_id
      and existing.roomnumber = new.roomnumber
      and existing.id <> new.id
      and existing.status in ('Confirmed', 'Checked-In')
      and existing.checkin < new.checkout
      and existing.checkout > new.checkin
  ) then
    raise exception 'Room is already reserved for the requested dates'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_reservations_prevent_overlap on nexushos.reservations;
create trigger trg_reservations_prevent_overlap
before insert or update of property_id, roomnumber, checkin, checkout, status
on nexushos.reservations
for each row execute function nexushos.enforce_reservation_availability();

-- Atomic fixed-window limiter used by public booking and onboarding routes.
-- It is SECURITY INVOKER and executable only by service_role.
create or replace function nexushos.consume_rate_limit(
  p_scope text,
  p_bucket_key text,
  p_limit integer,
  p_window_ms bigint,
  p_now_ms bigint
)
returns boolean
language plpgsql
security invoker
set search_path = nexushos, pg_temp
as $$
declare
  current_count integer;
begin
  if p_scope is null or p_bucket_key is null
     or p_limit < 1 or p_window_ms < 1000 or p_now_ms < 1 then
    raise exception 'Invalid rate-limit parameters' using errcode = '22023';
  end if;

  insert into nexushos.api_rate_limit_buckets (
    scope,
    bucket_key,
    window_start_ms,
    request_count,
    expires_at_ms
  )
  values (
    p_scope,
    p_bucket_key,
    p_now_ms,
    1,
    p_now_ms + p_window_ms
  )
  on conflict (scope, bucket_key) do update
    set window_start_ms = case
          when nexushos.api_rate_limit_buckets.expires_at_ms <= p_now_ms
            then p_now_ms
          else nexushos.api_rate_limit_buckets.window_start_ms
        end,
        request_count = case
          when nexushos.api_rate_limit_buckets.expires_at_ms <= p_now_ms
            then 1
          else nexushos.api_rate_limit_buckets.request_count + 1
        end,
        expires_at_ms = case
          when nexushos.api_rate_limit_buckets.expires_at_ms <= p_now_ms
            then p_now_ms + p_window_ms
          else nexushos.api_rate_limit_buckets.expires_at_ms
        end
  returning request_count into current_count;

  return current_count <= p_limit;
end;
$$;

revoke all on function nexushos.consume_rate_limit(text, text, integer, bigint, bigint)
  from public, anon, authenticated;
grant execute on function nexushos.consume_rate_limit(text, text, integer, bigint, bigint)
  to service_role;
