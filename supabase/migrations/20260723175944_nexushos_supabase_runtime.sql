-- NexusHOS production runtime for Supabase Edge Functions.
--
-- The hotel schema remains private from the browser. Only the service_role used
-- inside the authenticated Edge Function can reach it directly.

grant usage on schema nexushos to service_role;
grant select, insert, update, delete on all tables in schema nexushos to service_role;
grant usage, select on all sequences in schema nexushos to service_role;
grant execute on all functions in schema nexushos to service_role;

alter default privileges in schema nexushos
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema nexushos
  grant usage, select on sequences to service_role;
alter default privileges in schema nexushos
  grant execute on functions to service_role;

-- Keep direct Data API access closed. The Edge Function applies authentication,
-- role checks, validation, and response shaping.
revoke all on schema nexushos from anon, authenticated;
revoke all on all tables in schema nexushos from anon, authenticated;
revoke all on all sequences in schema nexushos from anon, authenticated;
revoke all on all functions in schema nexushos from anon, authenticated;

-- Minimum production property catalogue. This is configuration/reference data,
-- not invented guest or financial activity.
insert into nexushos.organizations (id, name, slug, created_at)
values ('org-nexus', 'Nexus Hospitality Group', 'nexus-hospitality', now()::text)
on conflict (id) do nothing;

insert into nexushos.properties
  (id, organization_id, code, name, timezone, currency, locale, total_rooms, status, created_at)
values
  ('prop-main', 'org-nexus', 'NXR', 'Nexus Luxury Resort & Spa',
   'Europe/Copenhagen', 'DKK', 'en-DK', 14, 'Active', now()::text)
on conflict (id) do nothing;

insert into nexushos.rooms
  (id, number, type, floor, status, baseprice, currentprice, amenities, currentguestname, status_since)
values
  ('101', '101', 'Standard King', 1, 'Vacant Clean', 180, 220, '["King Bed","City View","Wi-Fi 6","Rain Shower"]', null, current_date::text),
  ('102', '102', 'Standard King', 1, 'Vacant Clean', 180, 220, '["King Bed","City View","Wi-Fi 6"]', null, current_date::text),
  ('103', '103', 'Standard King', 1, 'Vacant Clean', 180, 210, '["King Bed","Garden Access","Smart TV"]', null, current_date::text),
  ('104', '104', 'Deluxe Ocean View', 1, 'Vacant Clean', 280, 340, '["Ocean Balcony","Nespresso","King Bed"]', null, current_date::text),
  ('105', '105', 'Deluxe Ocean View', 1, 'Vacant Clean', 280, 340, '["Ocean Balcony","Nespresso","Soaking Tub"]', null, current_date::text),
  ('201', '201', 'Deluxe Ocean View', 2, 'Vacant Clean', 290, 350, '["Private Balcony","Ocean View","Mini Bar"]', null, current_date::text),
  ('202', '202', 'Deluxe Ocean View', 2, 'Vacant Clean', 290, 350, '["Private Balcony","Ocean View"]', null, current_date::text),
  ('203', '203', 'Executive Suite', 2, 'Vacant Clean', 450, 560, '["Lounge Area","Free Breakfast","Butler Service"]', null, current_date::text),
  ('204', '204', 'Executive Suite', 2, 'Vacant Clean', 450, 560, '["Jacuzzi","Workstation"]', null, current_date::text),
  ('205', '205', 'Executive Suite', 2, 'Vacant Clean', 450, 560, '["Panoramic View"]', null, current_date::text),
  ('301', '301', 'Executive Suite', 3, 'Vacant Clean', 480, 580, '["High Floor","Skyline View","Espresso Bar"]', null, current_date::text),
  ('302', '302', 'Executive Suite', 3, 'Vacant Clean', 480, 580, '["High Floor","Skyline View"]', null, current_date::text),
  ('303', '303', 'Presidential Suite', 3, 'Vacant Clean', 1200, 1450, '["Private Terrace","Plunge Pool","Personal Chef Access"]', null, current_date::text),
  ('304', '304', 'Presidential Suite', 3, 'Out of Service', 1200, 1450, '["Private Terrace","Fireplace","Grand Piano"]', null, current_date::text)
on conflict (id) do nothing;

insert into nexushos.pricing_rules
  (id, roomtype, baserate, recommendedrate, demandfactor, competitoravgrate, occupancytrigger, autoapply)
values
  ('dp-1', 'Standard King', 180, 220, 1.22, 205, 75, 1),
  ('dp-2', 'Deluxe Ocean View', 280, 340, 1.21, 325, 80, 1),
  ('dp-3', 'Executive Suite', 450, 560, 1.24, 540, 85, 0),
  ('dp-4', 'Presidential Suite', 1200, 1450, 1.21, 1400, 90, 0)
on conflict (id) do nothing;

insert into nexushos.channels
  (id, name, logo, connected, activelistings, commissionrate, lastsync, synclatency, bookingsthismonth)
values
  ('ch-1', 'Direct Web', '🌐', 1, 14, 0, 'Not synced yet', '—', 0),
  ('ch-2', 'Booking.com', '🏨', 0, 0, 15, 'Not connected', '—', 0),
  ('ch-3', 'Airbnb', '🏠', 0, 0, 14, 'Not connected', '—', 0),
  ('ch-4', 'Expedia', '✈️', 0, 0, 18, 'Not connected', '—', 0),
  ('ch-5', 'Agoda', '🌏', 0, 0, 16, 'Not connected', '—', 0)
on conflict (id) do nothing;

insert into nexushos.gl_accounts (id, code, name, type)
values
  ('gl-1000', '1000', 'Cash', 'Asset'),
  ('gl-1100', '1100', 'AR Guest Ledger', 'Asset'),
  ('gl-1200', '1200', 'Inventory', 'Asset'),
  ('gl-2000', '2000', 'Accounts Payable', 'Liability'),
  ('gl-2100', '2100', 'Taxes Payable', 'Liability'),
  ('gl-3000', '3000', 'Owner Equity', 'Equity'),
  ('gl-4000', '4000', 'Rooms Revenue', 'Revenue'),
  ('gl-4100', '4100', 'F&B Revenue', 'Revenue'),
  ('gl-4200', '4200', 'Other Income', 'Revenue'),
  ('gl-5000', '5000', 'Payroll Expense', 'Expense'),
  ('gl-5100', '5100', 'Supplies Expense', 'Expense'),
  ('gl-5200', '5200', 'Utilities', 'Expense')
on conflict (id) do nothing;
