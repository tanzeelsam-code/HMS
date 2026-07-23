-- rls_auto_enable is an event-trigger helper, not a public RPC endpoint.
-- Keep the trigger behavior but remove direct execution from API roles.
revoke execute on function public.rls_auto_enable() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.rls_auto_enable() from anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.rls_auto_enable() from authenticated;
  end if;
end
$$;
