-- Clothing sets catalog + per-player claims. clothing_sets is the single source of
-- truth for what a set actually contains (real DayZ classnames) -- both shop.js and
-- the mod's Clothing tab read from it (the mod via mod-list-sets, joined against
-- claimed_sets), so there's no separate copy of this data to keep in sync by hand.
--
-- This file is meant to be edited and re-run whenever the catalog changes (new set,
-- fixed classname, etc) -- every statement here is safe to run again: table/index
-- creation is guarded with IF NOT EXISTS, policies are dropped and recreated, and the
-- seed data at the bottom uses ON CONFLICT ... DO UPDATE so editing a values() row and
-- re-running converges existing rows to match instead of erroring or being skipped.
-- Run in Supabase SQL Editor, after 001_schema.sql.

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
drop policy if exists "clothing_sets_select_all" on public.clothing_sets;
create policy "clothing_sets_select_all" on public.clothing_sets
  for select using (true);

drop policy if exists "claimed_sets_select_own" on public.claimed_sets;
create policy "claimed_sets_select_own" on public.claimed_sets
  for select using (
    player_id in (select id from public.players where id = auth.uid())
  );

-- Only sets with classnames actually confirmed real. Palm sets (Green/Purple/Red)
-- need the sk_palm/sk_tech clothing mods installed to render in-game (won't show on
-- a vanilla test server, but claiming/owning one doesn't require that -- only wearing
-- it does). Black/Green/Blue *vanilla* sets stay out of this table entirely (see
-- shop.js) until their piece classnames are verified real -- don't add rows for
-- those here until that happens, since a wrong classname fails silently in
-- CreateAttachment.
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
    'green_palm_set', 'Green Palm Set', 25, true,
    'sk_jacket_palm_green', 'Green Palm Jacket',
    'sk_pants_palm_green', 'Green Palm Pants',
    'Sneakers_White', 'White Sneakers',
    'SurgicalGloves_White', 'Surgical Gloves',
    'sk_tech_mask_Black', 'Palm Tech Mask',
    'BOUJI1_HAT', 'Bouji Hat'
  ),
  (
    'purple_palm_set', 'Purple Palm Set', 25, true,
    'sk_jacket_palm_purp', 'Purple Palm Jacket',
    'sk_pants_palm_purp', 'Purple Palm Pants',
    'Sneakers_Black', 'Black Sneakers',
    'SurgicalGloves_White', 'Surgical Gloves',
    'sk_tech_mask_Black', 'Palm Tech Mask',
    'BOUJI1_HAT', 'Bouji Hat'
  ),
  (
    'red_palm_set', 'Red Palm Set', 25, true,
    'sk_jacket_palm_red', 'Red Palm Jacket',
    'sk_pants_palm_red', 'Red Palm Pants',
    'Sneakers_Red', 'Red Sneakers',
    'SurgicalGloves_White', 'Surgical Gloves',
    'sk_tech_mask_Black', 'Palm Tech Mask',
    'BOUJI1_HAT', 'Bouji Hat'
  ),
  (
    'black_nike_tech', 'Black Nike Tech', 30, true,
    'sk_tech_hoodie_Black', 'Black Tech Hoodie',
    'sk_tech_pants_black', 'Black Tech Pants',
    'sk_tech_airmaxtn_rose', 'Rose Air Max TN',
    '', '',
    'sk_tech_mask_black', 'Black Tech Mask',
    '', ''
  ),
  (
    'white_nike_tech', 'White Nike Tech', 30, true,
    'sk_tech_hoodie_rose', 'Rose Tech Hoodie',
    'sk_tech_pants_rose', 'Rose Tech Pants',
    'sk_tech_airmaxtn_black', 'Black Air Max TN',
    '', '',
    'sk_tech_mask_rose', 'Rose Tech Mask',
    '', ''
  ),
  (
    'shadow_serpent_set', 'Shadow Serpent Set', 40, true,
    'boosted2_jacket', 'Serpent Jacket',
    'sk_tech_pants_black', 'Black Tech Pants',
    'BOUJI1_Shoes', 'Bouji Shoes',
    '', '',
    'boosted2_mask', 'Serpent Mask',
    '', ''
  ),
  (
    'nightmare_static_set', 'Nightmare Static Set', 40, true,
    'TShirt_xq', 'Static T-Shirt',
    'SlacksPants_xq', 'Static Slacks',
    'BOUJI1_Shoes', 'Bouji Shoes',
    'SurgicalGloves_xq', 'Surgical Gloves',
    'SKMask_xq', 'Static Ski Mask',
    'Boonie_xq', 'Boonie Hat'
  ),
  (
    'white_girl_summer_set', 'White Girl Summer Set', 50, true,
    'BOUJI2_Shirt', 'Bouji Shirt',
    'FOG_AthleticShorts_Black', 'Black Athletic Shorts',
    'Drip_NikeAirForce_1_triple_white', 'White Nike Air Force 1',
    'FOG_FerroGloves_Black', 'Black Ferro Gloves',
    'FOG_Knight_Mask_Black', 'Black Knight Mask',
    'FOG_Glasses_PitViper_Tropics', 'Pit Viper Tropics Glasses'
  ),
  (
    'palm_mix_set', 'Palm Mix Set', 50, true,
    'BOUJI1_Shirt', 'Bouji Shirt',
    'BOUJI1_Shortu', 'Bouji Shorts',
    'Drip_NikeAirForce_1_triple_black', 'Black Nike Air Force 1',
    'BOOSTED_Gloves', 'Boosted Gloves',
    'BOOSTED_MASK', 'Boosted Mask',
    'BOOSTED_Boonie', 'Boosted Boonie'
  )
on conflict (key) do update set
  name = excluded.name,
  unlock_hours = excluded.unlock_hours,
  active = excluded.active,
  body_classname = excluded.body_classname,
  body_label = excluded.body_label,
  legs_classname = excluded.legs_classname,
  legs_label = excluded.legs_label,
  feet_classname = excluded.feet_classname,
  feet_label = excluded.feet_label,
  gloves_classname = excluded.gloves_classname,
  gloves_label = excluded.gloves_label,
  mask_classname = excluded.mask_classname,
  mask_label = excluded.mask_label,
  headgear_classname = excluded.headgear_classname,
  headgear_label = excluded.headgear_label;

-- Red Set (the vanilla test set) is retired -- deactivated rather than deleted so
-- it doesn't cascade-delete anyone's existing claimed_sets row, it just stops
-- showing up in the shop and in mod-list-sets going forward. No-op if it was never
-- inserted in the first place.
update public.clothing_sets set active = false where key = 'red_vanilla_set';
