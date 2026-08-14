-- GWARZ website: players + rewards schema
-- Run this once in Supabase SQL Editor.

create table if not exists public.players (
  id uuid primary key references auth.users(id) on delete cascade,
  discord_id text,
  discord_username text,
  discord_avatar_url text,
  steam_id text,
  steam_username text,
  steam_avatar_url text,
  spins_available integer not null default 0,
  last_playtime_seconds integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists players_steam_id_key
  on public.players (steam_id) where steam_id is not null;

create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  item_classname text not null,
  item_label text not null,
  status text not null default 'pending' check (status in ('pending','claimed')),
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);

create index if not exists rewards_player_id_idx on public.rewards (player_id);

alter table public.players enable row level security;
alter table public.rewards enable row level security;

-- Players can read their own row only. All writes go through Edge Functions using the
-- service_role key, which bypasses RLS entirely — no write policies needed here.
create policy "players_select_own" on public.players
  for select using (auth.uid() = id);

create policy "rewards_select_own" on public.rewards
  for select using (
    player_id in (select id from public.players where id = auth.uid())
  );
