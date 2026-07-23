-- Multi-Tenant isolation schema update for NexusHOS
set search_path to nexushos, public;

-- Add property_id to all operational tables if not exists
alter table nexushos.rooms add column if not exists property_id text default 'prop-main';
alter table nexushos.reservations add column if not exists property_id text default 'prop-main';
alter table nexushos.housekeeping_tasks add column if not exists property_id text default 'prop-main';
alter table nexushos.pricing_rules add column if not exists property_id text default 'prop-main';
alter table nexushos.channels add column if not exists property_id text default 'prop-main';
alter table nexushos.pos_charges add column if not exists property_id text default 'prop-main';
alter table nexushos.guest_profiles add column if not exists property_id text default 'prop-main';
alter table nexushos.maintenance_orders add column if not exists property_id text default 'prop-main';
alter table nexushos.gl_accounts add column if not exists property_id text default 'prop-main';
alter table nexushos.journal_entries add column if not exists property_id text default 'prop-main';
alter table nexushos.inventory_items add column if not exists property_id text default 'prop-main';
alter table nexushos.vendors add column if not exists property_id text default 'prop-main';
alter table nexushos.purchase_orders add column if not exists property_id text default 'prop-main';
alter table nexushos.employees add column if not exists property_id text default 'prop-main';
alter table nexushos.shifts add column if not exists property_id text default 'prop-main';

-- Create indexes for property_id query performance
create index if not exists idx_rooms_property_id on nexushos.rooms(property_id);
create index if not exists idx_reservations_property_id on nexushos.reservations(property_id);
create index if not exists idx_housekeeping_property_id on nexushos.housekeeping_tasks(property_id);
create index if not exists idx_guest_profiles_property_id on nexushos.guest_profiles(property_id);
create index if not exists idx_maintenance_orders_property_id on nexushos.maintenance_orders(property_id);
create index if not exists idx_inventory_items_property_id on nexushos.inventory_items(property_id);
create index if not exists idx_employees_property_id on nexushos.employees(property_id);
