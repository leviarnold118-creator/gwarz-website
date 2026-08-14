-- Refines spin tracking to be self-correcting (idempotent even if sync runs more than
-- once or playtime data is re-read), and adds small backend-only support tables.
-- Run this once in Supabase SQL Editor, after 001_schema.sql.

alter table public.players rename column last_playtime_seconds to total_playtime_seconds;
alter table public.players add column spins_awarded_total integer not null default 0;
alter table public.players add column spins_used_total integer not null default 0;
alter table public.players drop column spins_available;
alter table public.players add column spins_available integer
  generated always as (spins_awarded_total - spins_used_total) stored;

-- Short-lived state used to carry "who is linking Steam" through the Steam OpenID
-- redirect round-trip, without putting a real access token in a URL.
create table if not exists public.steam_link_states (
  state text primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.steam_link_states enable row level security;

-- Caches the CFTools Data API bearer token (24h lifetime) so we don't hit their
-- 2/minute auth rate limit every time a player's account page loads.
create table if not exists public.cftools_token_cache (
  id smallint primary key default 1,
  token text not null,
  expires_at timestamptz not null,
  constraint single_row check (id = 1)
);
alter table public.cftools_token_cache enable row level security;

-- Caches the resolved server_api_id (discovered via /v1/@app/grants) so we don't
-- re-resolve it on every sync.
create table if not exists public.cftools_settings (
  id smallint primary key default 1,
  server_api_id text,
  constraint single_row check (id = 1)
);
alter table public.cftools_settings enable row level security;

-- No RLS policies added for these three tables on purpose: only the service_role key
-- (used exclusively by Edge Functions) can touch them; anon/authenticated get zero access.
