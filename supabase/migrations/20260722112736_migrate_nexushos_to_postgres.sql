-- NexusHOS shares the NexusERP Supabase PostgreSQL instance without sharing
-- ERP tables. The application owns all objects inside this private schema.
create schema if not exists nexushos;
comment on schema nexushos is
  'Private NexusHOS operational schema. Access only through the NexusHOS server API.';

revoke all on schema nexushos from public;
alter default privileges in schema nexushos revoke all on tables from public;
alter default privileges in schema nexushos revoke all on sequences from public;
alter default privileges in schema nexushos revoke execute on functions from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on schema nexushos from anon;
    revoke all on all tables in schema nexushos from anon;
    revoke all on all sequences in schema nexushos from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on schema nexushos from authenticated;
    revoke all on all tables in schema nexushos from authenticated;
    revoke all on all sequences in schema nexushos from authenticated;
  end if;
end
$$;

create table if not exists nexushos.schema_migrations (
  version integer primary key,
  name text not null unique,
  applied_at text not null
);

insert into nexushos.schema_migrations (version, name, applied_at)
values (0, 'supabase_private_schema_boundary', now()::text)
on conflict (version) do nothing;
