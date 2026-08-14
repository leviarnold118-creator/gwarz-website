-- The service_role used by all Edge Functions never had explicit table privileges
-- granted, even though it bypasses RLS. Run this once in SQL Editor.

grant usage on schema public to service_role;

grant select, insert, update, delete on public.players to service_role;
grant select, insert, update, delete on public.rewards to service_role;
grant select, insert, update, delete on public.steam_link_states to service_role;
grant select, insert, update, delete on public.cftools_token_cache to service_role;
grant select, insert, update, delete on public.cftools_settings to service_role;
