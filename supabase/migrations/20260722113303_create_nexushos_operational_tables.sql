set search_path to nexushos, public;

create table if not exists users (
  id text primary key,
  name text,
  email text unique,
  password text,
  role text,
  active integer not null default 1,
  must_change_password integer not null default 0
);

create table if not exists sessions (
  token text primary key,
  user_id text references users(id),
  created_at text
);

create table if not exists rooms (
  id text primary key,
  number text unique,
  type text,
  floor integer,
  status text,
  basePrice real,
  currentPrice real,
  amenities text,
  currentGuestName text,
  status_since text
);

create table if not exists reservations (
  id text primary key,
  code text,
  guestName text,
  guestEmail text,
  guestPhone text,
  vipTier text,
  roomNumber text,
  roomType text,
  checkIn text,
  checkOut text,
  nights integer,
  guestsCount integer,
  status text,
  channel text,
  totalAmount real,
  paidAmount real,
  specialRequests text,
  contactlessCheckInCompleted integer default 0,
  actualCheckOut text
);

create table if not exists folio_items (
  id text primary key,
  reservation_id text references reservations(id),
  date text,
  description text,
  category text,
  amount real,
  postedBy text
);

create table if not exists housekeeping_tasks (
  id text primary key,
  roomNumber text,
  roomType text,
  floor integer,
  taskType text,
  status text,
  assignedTo text,
  priority text,
  etaMinutes integer
);

create table if not exists pricing_rules (
  id text primary key,
  roomType text,
  baseRate real,
  recommendedRate real,
  demandFactor real,
  competitorAvgRate real,
  occupancyTrigger real,
  autoApply integer
);

create table if not exists channels (
  id text primary key,
  name text,
  logo text,
  connected integer,
  activeListings integer,
  commissionRate real,
  lastSync text,
  syncLatency text,
  bookingsThisMonth integer
);

create table if not exists pos_charges (
  id text primary key,
  time text,
  roomNumber text,
  guestName text,
  outlet text,
  items text,
  total real,
  status text
);

create table if not exists guest_profiles (
  id text primary key,
  name text,
  email text,
  phone text,
  vipTier text,
  totalStays integer,
  totalNights integer,
  lifetimeSpend real,
  preferredRoomType text,
  dietaryPreferences text,
  notes text,
  lastStayDate text
);

create table if not exists maintenance_orders (
  id text primary key,
  roomNumber text,
  issueDescription text,
  category text,
  priority text,
  status text,
  reportedBy text,
  assignedEngineer text,
  slaMinutes integer,
  reportedTime text,
  safetyCritical integer default 0
);

create table if not exists gl_accounts (
  id text primary key,
  code text,
  name text,
  type text
);

create table if not exists journal_entries (
  id text primary key,
  date text,
  description text,
  source text
);

create table if not exists journal_lines (
  id text primary key,
  entry_id text references journal_entries(id),
  account_id text references gl_accounts(id),
  debit real,
  credit real
);

create table if not exists inventory_items (
  id text primary key,
  name text,
  category text,
  unit text,
  onHand real,
  parLevel real,
  costPerUnit real
);

create table if not exists vendors (
  id text primary key,
  name text,
  contact text,
  category text
);

create table if not exists purchase_orders (
  id text primary key,
  vendorId text,
  itemId text,
  qty real,
  unitCost real,
  status text,
  orderDate text
);

create table if not exists employees (
  id text primary key,
  name text,
  role text,
  department text,
  shift text,
  hourlyRate real,
  status text
);

create table if not exists shifts (
  id text primary key,
  employeeId text,
  date text,
  start_time text,
  end_time text
);

create table if not exists night_audit_postings (
  business_date text not null,
  reservation_id text not null references reservations(id),
  folio_item_id text not null unique references folio_items(id),
  journal_entry_id text references journal_entries(id),
  created_at text not null,
  primary key (business_date, reservation_id)
);

create table if not exists folio_journal_postings (
  folio_item_id text primary key references folio_items(id),
  journal_entry_id text not null references journal_entries(id),
  created_at text not null
);

create table if not exists organizations (
  id text primary key,
  name text not null,
  slug text not null unique,
  created_at text not null
);

create table if not exists properties (
  id text primary key,
  organization_id text not null references organizations(id),
  code text not null unique,
  name text not null,
  timezone text not null,
  currency text not null,
  locale text not null,
  total_rooms integer not null,
  status text not null,
  created_at text not null
);

create table if not exists user_property_memberships (
  user_id text not null references users(id),
  property_id text not null references properties(id),
  role text not null,
  created_at text not null,
  primary key (user_id, property_id)
);

create table if not exists property_daily_metrics (
  property_id text not null references properties(id),
  business_date text not null,
  occupancy_rate real not null,
  adr real not null,
  revpar real not null,
  total_revenue real not null,
  goppar real not null,
  source text not null,
  recorded_at text not null,
  primary key (property_id, business_date)
);

create table if not exists group_bookings (
  id text primary key,
  property_id text not null references properties(id),
  group_name text not null,
  company_name text not null,
  contact_person text,
  contact_email text,
  rooms_allocated integer not null,
  rooms_picked_up integer not null default 0,
  start_date text not null,
  end_date text not null,
  release_date text,
  status text not null,
  group_rate real not null,
  banquet_catering_total real not null default 0,
  total_value real not null,
  created_by text references users(id),
  created_at text not null,
  updated_at text not null
);

create table if not exists group_room_blocks (
  group_booking_id text not null references group_bookings(id) on delete cascade,
  room_type text not null,
  rooms_allocated integer not null,
  primary key (group_booking_id, room_type),
  check (rooms_allocated > 0)
);

create table if not exists reputation_reviews (
  id text primary key,
  property_id text not null references properties(id),
  source text not null,
  external_id text,
  guest_name text not null,
  rating integer not null,
  review_date text not null,
  review_text text not null,
  sentiment text not null,
  response_draft text,
  response_text text,
  responded_by text references users(id),
  responded_at text,
  imported_at text not null
);

create table if not exists esg_metrics (
  property_id text not null references properties(id),
  date text not null,
  carbon_per_occupied_room_kg real not null,
  energy_kwh_saved real not null,
  hvac_auto_setbacks_triggered integer not null,
  water_consumption_liters real not null,
  renewable_energy_percentage real not null,
  source text not null,
  recorded_at text not null,
  primary key (property_id, date)
);

create table if not exists esg_actions (
  id text primary key,
  property_id text not null references properties(id),
  action_type text not null,
  target text not null,
  status text not null,
  requested_by text not null references users(id),
  requested_at text not null,
  provider text,
  executed_at text,
  result text
);

create table if not exists booking_quotes (
  id text primary key,
  check_in text not null,
  check_out text not null,
  nights integer not null,
  guests_count integer not null,
  room_type text not null,
  nightly_rate real not null,
  room_total real not null,
  tax_rate real not null,
  tax_amount real not null,
  grand_total real not null,
  currency text not null,
  status text not null default 'Open',
  created_at text not null,
  expires_at text not null,
  consumed_at text,
  reservation_id text references reservations(id)
);

create table if not exists booking_idempotency (
  idempotency_key text primary key,
  request_hash text not null,
  response_status integer not null,
  response_body text not null,
  reservation_id text references reservations(id),
  created_at text not null
);

create table if not exists workflow_templates (
  id text primary key,
  name text not null,
  description text not null default '',
  trigger_type text not null,
  trigger_config text not null default '{}',
  actions text not null,
  risk_level text not null check (risk_level in ('Low', 'Medium', 'High', 'Critical')),
  approval_mode text not null check (approval_mode in ('risk-based', 'always', 'never')),
  status text not null check (status in ('Active', 'Paused', 'Archived')),
  version integer not null default 1 check (version > 0),
  created_by text not null,
  created_at text not null,
  updated_by text not null,
  updated_at text not null
);

create table if not exists workflow_runs (
  id text primary key,
  template_id text not null references workflow_templates(id),
  template_version integer not null,
  template_snapshot text not null,
  idempotency_key text not null unique,
  request_fingerprint text not null,
  status text not null check (status in ('Awaiting Approval', 'Running', 'Completed', 'Rejected', 'Failed')),
  risk_level text not null check (risk_level in ('Low', 'Medium', 'High', 'Critical')),
  approval_required integer not null check (approval_required in (0, 1)),
  context text not null default '{}',
  execution_output text not null default '{}',
  requested_by text not null,
  requested_at text not null,
  approved_by text,
  approved_at text,
  completed_at text
);

create table if not exists workflow_tasks (
  id text primary key,
  run_id text references workflow_runs(id),
  template_id text references workflow_templates(id),
  title text not null,
  description text not null default '',
  department text not null,
  assigned_to text not null default '',
  priority text not null check (priority in ('Low', 'Normal', 'High', 'Urgent')),
  status text not null check (status in ('Open', 'In Progress', 'Blocked', 'Completed', 'Cancelled')),
  room_number text,
  due_at text,
  completed_at text,
  metadata text not null default '{}',
  created_by text not null,
  created_at text not null,
  updated_by text not null,
  updated_at text not null
);

create table if not exists workflow_audit_events (
  id text primary key,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  actor text not null,
  details text not null default '{}',
  created_at text not null
);

create table if not exists workflow_event_outbox (
  id text primary key,
  event_key text not null unique,
  event_type text not null,
  aggregate_id text not null,
  event_version text not null,
  context text not null default '{}',
  actor text not null,
  status text not null check (status in ('Pending', 'Processing', 'Completed', 'Failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at text not null,
  lease_owner text,
  lease_expires_at text,
  last_error text,
  created_at text not null,
  completed_at text
);

create table if not exists webhook_subscriptions (
  id text primary key,
  url text not null,
  description text,
  event_types_json text not null,
  secret_encrypted text not null,
  active integer not null default 1 check (active in (0, 1)),
  created_by text not null,
  created_at text not null,
  updated_at text not null
);

create table if not exists webhook_events (
  id text primary key,
  event_type text not null,
  occurred_at text not null,
  request_id text,
  payload_json text not null,
  created_at text not null
);

create table if not exists webhook_delivery_attempts (
  id text primary key,
  event_id text not null references webhook_events(id),
  subscription_id text not null references webhook_subscriptions(id),
  attempt_number integer not null check (attempt_number >= 1),
  status text not null check (status in ('Pending', 'Delivering', 'Succeeded', 'Failed')),
  scheduled_at text not null,
  started_at text,
  completed_at text,
  response_status integer,
  response_body text,
  error_message text,
  signature_version text,
  lease_owner text,
  lease_expires_at text,
  created_at text not null,
  unique (event_id, subscription_id, attempt_number)
);

create table if not exists audit_events (
  sequence bigserial primary key,
  id text not null unique,
  occurred_at text not null,
  request_id text,
  actor_id text,
  actor_role text,
  action text not null,
  resource_type text,
  resource_id text,
  outcome text not null check (outcome in ('success', 'failure', 'denied')),
  source text not null,
  network_hash text,
  metadata_json text not null,
  previous_hash text,
  event_hash text not null unique
);

create table if not exists api_rate_limit_buckets (
  scope text not null,
  bucket_key text not null,
  window_start_ms bigint not null,
  request_count integer not null check (request_count >= 0),
  expires_at_ms bigint not null,
  primary key (scope, bucket_key)
);

create unique index if not exists idx_users_normalized_email
  on users(lower(trim(email)));
create unique index if not exists idx_reservations_code_unique
  on reservations(code);
create index if not exists idx_group_bookings_property_dates
  on group_bookings(property_id, start_date, end_date);
create index if not exists idx_group_room_blocks_room_type
  on group_room_blocks(room_type, group_booking_id);
create index if not exists idx_reputation_reviews_property_date
  on reputation_reviews(property_id, review_date desc);
create index if not exists idx_booking_quotes_expiry
  on booking_quotes(status, expires_at);
create index if not exists idx_booking_idempotency_created
  on booking_idempotency(created_at);
create index if not exists idx_workflow_templates_status
  on workflow_templates(status, updated_at desc);
create index if not exists idx_workflow_runs_template
  on workflow_runs(template_id, requested_at desc);
create index if not exists idx_workflow_runs_status
  on workflow_runs(status, requested_at desc);
create index if not exists idx_workflow_tasks_status_due
  on workflow_tasks(status, due_at);
create index if not exists idx_workflow_tasks_run
  on workflow_tasks(run_id);
create index if not exists idx_workflow_audit_entity
  on workflow_audit_events(entity_type, entity_id, created_at desc);
create index if not exists idx_workflow_event_outbox_due
  on workflow_event_outbox(status, available_at, lease_expires_at);
create index if not exists idx_webhook_subscriptions_active
  on webhook_subscriptions(active, updated_at desc);
create index if not exists idx_webhook_events_type_time
  on webhook_events(event_type, occurred_at desc);
create index if not exists idx_webhook_attempts_due
  on webhook_delivery_attempts(status, scheduled_at);
create index if not exists idx_webhook_attempts_subscription
  on webhook_delivery_attempts(subscription_id, created_at desc);
create index if not exists idx_webhook_attempts_event
  on webhook_delivery_attempts(event_id, attempt_number);
create index if not exists idx_audit_events_occurred_at
  on audit_events(occurred_at desc);
create index if not exists idx_audit_events_actor
  on audit_events(actor_id, sequence desc);
create index if not exists idx_audit_events_action
  on audit_events(action, sequence desc);
create index if not exists idx_audit_events_resource
  on audit_events(resource_type, resource_id, sequence desc);
create index if not exists idx_api_rate_limit_buckets_expiry
  on api_rate_limit_buckets(expires_at_ms);

create or replace function nexushos_reject_immutable_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '55000';
end;
$$;

drop trigger if exists audit_events_reject_mutation on audit_events;
create trigger audit_events_reject_mutation
before update or delete on audit_events
for each row execute function nexushos_reject_immutable_mutation();

drop trigger if exists webhook_events_reject_mutation on webhook_events;
create trigger webhook_events_reject_mutation
before update or delete on webhook_events
for each row execute function nexushos_reject_immutable_mutation();

drop trigger if exists workflow_audit_events_reject_mutation on workflow_audit_events;
create trigger workflow_audit_events_reject_mutation
before update or delete on workflow_audit_events
for each row execute function nexushos_reject_immutable_mutation();

create or replace function nexushos_reject_workflow_request_rewrite()
returns trigger
language plpgsql
as $$
begin
  if row(
    old.template_id, old.template_version, old.template_snapshot,
    old.idempotency_key, old.request_fingerprint, old.risk_level,
    old.approval_required, old.context, old.requested_by, old.requested_at
  ) is distinct from row(
    new.template_id, new.template_version, new.template_snapshot,
    new.idempotency_key, new.request_fingerprint, new.risk_level,
    new.approval_required, new.context, new.requested_by, new.requested_at
  ) then
    raise exception 'workflow run request evidence is immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists workflow_runs_immutable_request on workflow_runs;
create trigger workflow_runs_immutable_request
before update on workflow_runs
for each row execute function nexushos_reject_workflow_request_rewrite();

insert into schema_migrations (version, name, applied_at)
values (1, 'nexushos_postgresql_baseline', now()::text)
on conflict (version) do nothing;

do $$
declare
  table_record record;
begin
  for table_record in
    select tablename
    from pg_tables
    where schemaname = 'nexushos'
  loop
    execute format('alter table nexushos.%I enable row level security', table_record.tablename);
  end loop;
end
$$;

revoke all on schema nexushos from public;
revoke all on all tables in schema nexushos from public;
revoke all on all sequences in schema nexushos from public;
revoke all on all functions in schema nexushos from public;
alter default privileges in schema nexushos revoke all on tables from public;
alter default privileges in schema nexushos revoke all on sequences from public;
alter default privileges in schema nexushos revoke execute on functions from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on schema nexushos from anon;
    revoke all on all tables in schema nexushos from anon;
    revoke all on all sequences in schema nexushos from anon;
    revoke all on all functions in schema nexushos from anon;
    alter default privileges in schema nexushos revoke all on tables from anon;
    alter default privileges in schema nexushos revoke all on sequences from anon;
    alter default privileges in schema nexushos revoke execute on functions from anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on schema nexushos from authenticated;
    revoke all on all tables in schema nexushos from authenticated;
    revoke all on all sequences in schema nexushos from authenticated;
    revoke all on all functions in schema nexushos from authenticated;
    alter default privileges in schema nexushos revoke all on tables from authenticated;
    alter default privileges in schema nexushos revoke all on sequences from authenticated;
    alter default privileges in schema nexushos revoke execute on functions from authenticated;
  end if;
end
$$;
