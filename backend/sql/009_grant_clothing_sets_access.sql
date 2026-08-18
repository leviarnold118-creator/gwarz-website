-- Same class of issue as 004/006: clothing_sets/claimed_sets got RLS policies but no
-- table-level grants, so every role (including service_role, which Edge Functions use)
-- gets "permission denied" before RLS is ever evaluated. Run in SQL Editor.

grant select on public.clothing_sets to anon;
grant select on public.clothing_sets to authenticated;
grant select on public.claimed_sets to authenticated;

grant select, insert, update, delete on public.clothing_sets to service_role;
grant select, insert, update, delete on public.claimed_sets to service_role;
