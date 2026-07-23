-- Moves the /metrics aggregation from the Edge Function (which previously
-- fetched every room, reservation, and folio row for a property on each
-- request and reduced them in JavaScript) into a single Postgres function.
-- This avoids shipping full tables across the network for a handful of
-- aggregate numbers and lets the query planner use the property_id indexes.

set search_path to nexushos, public;

create or replace function nexushos.property_metrics(p_property_id text)
returns table (
  business_date date,
  occupancy_rate numeric,
  adr numeric,
  rev_par numeric,
  total_revenue numeric,
  arrivals_today bigint,
  departures_today bigint,
  in_house_guests bigint,
  dirty_rooms bigint
)
language sql
stable
security invoker
set search_path = nexushos, pg_temp
as $$
  with property as (
    select timezone from nexushos.properties where id = p_property_id
  ),
  biz as (
    select (now() at time zone coalesce((select timezone from property), 'UTC'))::date as business_date
  ),
  room_stats as (
    select
      count(*) filter (where status <> 'Out of Service') as sellable,
      count(*) filter (where status = 'Occupied') as occupied,
      count(*) filter (where status = 'Vacant Dirty') as dirty
    from nexushos.rooms
    where property_id = p_property_id
  ),
  res_stats as (
    select
      coalesce(sum(nights) filter (where status in ('Confirmed', 'Checked-In')), 0) as occupied_nights,
      count(*) filter (
        where checkin = (select business_date::text from biz)
          and status not in ('Cancelled', 'No-Show')
      ) as arrivals_today,
      count(*) filter (
        where checkout = (select business_date::text from biz)
          and status not in ('Cancelled', 'No-Show')
      ) as departures_today,
      coalesce(sum(guestscount) filter (where status = 'Checked-In'), 0) as in_house_guests
    from nexushos.reservations
    where property_id = p_property_id
  ),
  folio_stats as (
    select
      coalesce(sum(amount) filter (where category = 'Room Charge'), 0)::numeric as room_revenue,
      coalesce(sum(amount), 0)::numeric as total_revenue
    from nexushos.folio_items
    where property_id = p_property_id
  ),
  computed as (
    select
      biz.business_date,
      case when room_stats.sellable > 0
        then round((room_stats.occupied::numeric / room_stats.sellable) * 100, 1)
        else 0
      end as occupancy_rate,
      round(folio_stats.room_revenue / greatest(1, res_stats.occupied_nights), 2) as adr,
      room_stats.dirty,
      res_stats.arrivals_today,
      res_stats.departures_today,
      res_stats.in_house_guests,
      folio_stats.total_revenue
    from biz, room_stats, res_stats, folio_stats
  )
  select
    computed.business_date,
    computed.occupancy_rate,
    computed.adr,
    round(computed.adr * computed.occupancy_rate / 100, 2) as rev_par,
    round(computed.total_revenue, 2) as total_revenue,
    computed.arrivals_today,
    computed.departures_today,
    computed.in_house_guests,
    computed.dirty
  from computed;
$$;

revoke all on function nexushos.property_metrics(text) from public, anon, authenticated;
grant execute on function nexushos.property_metrics(text) to service_role;
