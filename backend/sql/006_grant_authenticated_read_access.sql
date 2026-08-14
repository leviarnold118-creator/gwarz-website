-- The "authenticated" role (used for direct browser reads, e.g. the header avatar
-- widget and the rewards list) was also never granted table privileges, same class
-- of issue as migration 004 for service_role. RLS policies already restrict these to
-- each player's own rows — this just allows the underlying SELECT to be attempted at
-- all. Run in SQL Editor.

grant select on public.players to authenticated;
grant select on public.rewards to authenticated;
