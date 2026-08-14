-- Adds combat stats pulled from CFTools alongside playtime, for the profile widget.
-- Run in SQL Editor.

alter table public.players
  add column if not exists kills integer,
  add column if not exists deaths integer,
  add column if not exists kd_ratio numeric,
  add column if not exists longest_kill numeric,
  add column if not exists longest_shot numeric,
  add column if not exists kills_infected integer,
  add column if not exists suicides integer;
