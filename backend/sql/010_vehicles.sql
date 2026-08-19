-- Vehicle spawner catalog + per-player claims. vehicles is the single source of
-- truth for what's spawnable (real DayZ vehicle classnames) -- both vehicles.js and
-- the mod's Vehicles tab read from it (the mod via mod-list-vehicles, joined against
-- claimed_vehicles), same shape as clothing_sets/claimed_sets.
--
-- Grants are included here up front (not a separate follow-up migration) -- new
-- tables never get anon/authenticated/service_role table-level access by default in
-- this project even with RLS policies in place (same issue clothing_sets hit in
-- migration 009), so skipping this step here would just reproduce that same bug.
--
-- This file is meant to be edited and re-run whenever the catalog changes, same as
-- 008_clothing_sets.sql -- everything here is safe to run again.
-- Run in Supabase SQL Editor, after 001_schema.sql.

create table if not exists public.vehicles (
  key text primary key,
  name text not null,
  classname text not null default '',
  -- Attachment classnames the mod attaches after spawning (wheels, doors, battery,
  -- spark plug, radiator, etc) -- a bare CreateObject with nothing attached spawns
  -- an undriveable shell. Different vehicle types need different parts, so this is
  -- per-vehicle rather than hardcoded in the mod. Confirmed real part list for a
  -- vanilla CivilianSedan (from VPPAdminTools' SpawnCarModule.c), as a reference for
  -- what a car-shaped vehicle typically needs -- adjust for whatever you're adding:
  -- civsedanhood, civsedanhood, CivSedanDoors_CoDriver, CivSedanDoors_Driver,
  -- CivSedanDoors_BackLeft, CivSedanDoors_BackRight, civsedantrunk, civsedanwheel x4,
  -- SparkPlug, EngineBelt, CarBattery, CarRadiator.
  parts text[] not null default '{}',
  unlock_hours integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.claimed_vehicles (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  vehicle_key text not null references public.vehicles(key) on delete cascade,
  claimed_at timestamptz not null default now(),
  unique (player_id, vehicle_key)
);

create index if not exists claimed_vehicles_player_id_idx on public.claimed_vehicles (player_id);

alter table public.vehicles enable row level security;
alter table public.claimed_vehicles enable row level security;

drop policy if exists "vehicles_select_all" on public.vehicles;
create policy "vehicles_select_all" on public.vehicles
  for select using (true);

drop policy if exists "claimed_vehicles_select_own" on public.claimed_vehicles;
create policy "claimed_vehicles_select_own" on public.claimed_vehicles
  for select using (
    player_id in (select id from public.players where id = auth.uid())
  );

grant select on public.vehicles to anon;
grant select on public.vehicles to authenticated;
grant select on public.claimed_vehicles to authenticated;

grant select, insert, update, delete on public.vehicles to service_role;
grant select, insert, update, delete on public.claimed_vehicles to service_role;

-- Confirmed real part classnames for Hatchback_02_Black.
insert into public.vehicles (key, name, classname, parts, unlock_hours, active)
values
  (
    'gunter', 'Gunter', 'Hatchback_02_Black',
    array[
      'Hatchback_02_Door_1_1_Black', 'Hatchback_02_Door_1_2_Black',
      'Hatchback_02_Door_2_1_Black', 'Hatchback_02_Door_2_2_Black',
      'Hatchback_02_Hood_Black', 'Hatchback_02_Trunk_Black',
      'Hatchback_02_Wheel', 'Hatchback_02_Wheel', 'Hatchback_02_Wheel', 'Hatchback_02_Wheel', 'Hatchback_02_Wheel',
      'CarRadiator', 'SparkPlug', 'CarBattery'
    ],
    0, true
  )
on conflict (key) do update set
  name = excluded.name,
  classname = excluded.classname,
  parts = excluded.parts,
  unlock_hours = excluded.unlock_hours,
  active = excluded.active;
