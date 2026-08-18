-- Clothing sets catalog + per-player claims. clothing_sets is the single source of
-- truth for what a set actually contains (real DayZ classnames) -- both shop.js and
-- the mod's Clothing tab read from it (the mod via mod-list-sets, joined against
-- claimed_sets), so there's no separate copy of this data to keep in sync by hand.
-- Run this once in Supabase SQL Editor, after 001_schema.sql.

create table if not exists public.clothing_sets (
  key text primary key,
  name text not null,
  unlock_hours integer not null default 0,
  active boolean not null default true,
  body_classname text not null default '',
  body_label text not null default '',
  legs_classname text not null default '',
  legs_label text not null default '',
  feet_classname text not null default '',
  feet_label text not null default '',
  gloves_classname text not null default '',
  gloves_label text not null default '',
  mask_classname text not null default '',
  mask_label text not null default '',
  headgear_classname text not null default '',
  headgear_label text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.claimed_sets (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  set_key text not null references public.clothing_sets(key) on delete cascade,
  claimed_at timestamptz not null default now(),
  unique (player_id, set_key)
);

create index if not exists claimed_sets_player_id_idx on public.claimed_sets (player_id);

alter table public.clothing_sets enable row level security;
alter table public.claimed_sets enable row level security;

-- The catalog itself isn't sensitive -- shop.js needs to read it while logged out too,
-- to show what exists and what it takes to unlock it.
create policy "clothing_sets_select_all" on public.clothing_sets
  for select using (true);

create policy "claimed_sets_select_own" on public.claimed_sets
  for select using (
    player_id in (select id from public.players where id = auth.uid())
  );

-- Only the two sets with classnames actually confirmed real this session. Green Palm
-- Set needs the sk_palm/sk_tech/Drip clothing mods installed to render in-game (won't
-- show on a vanilla test server, but claiming/owning it doesn't require that -- only
-- wearing it does). Black/Green/Blue sets stay off the shop page (see shop.js) until
-- their piece classnames are verified the same way -- don't add rows for those here
-- until that happens, since a wrong classname fails silently in CreateAttachment.
insert into public.clothing_sets (
  key, name, unlock_hours, active,
  body_classname, body_label,
  legs_classname, legs_label,
  feet_classname, feet_label,
  gloves_classname, gloves_label,
  mask_classname, mask_label,
  headgear_classname, headgear_label
) values
  (
    'red_vanilla_set', 'Red Set', 25, true,
    'Hoodie_Red', 'Red Hoodie',
    'Jeans_Blue', 'Blue Jeans',
    'Sneakers_White', 'White Sneakers',
    'LeatherGloves_Black', 'Leather Gloves',
    'BalaclavaMask_Black', 'Black Balaclava',
    'BaseballCap_Red', 'Red Cap'
  ),
  (
    'green_palm_set', 'Green Palm Set', 25, true,
    'sk_jacket_palm_green', 'Green Palm Jacket',
    'sk_pants_palm_green', 'Green Palm Pants',
    'Drip_CrocSocks_Relaxed_black', 'Green Palm Socks',
    'SurgicalGloves_White', 'Surgical Gloves',
    'sk_tech_mask_Black', 'Green Palm Mask',
    'BOUJI1_HAT', 'Bouji Hat'
  )
on conflict (key) do nothing;
