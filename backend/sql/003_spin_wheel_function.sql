-- Atomically spends one banked spin and records the reward won, so concurrent/duplicate
-- requests can't award more spins than a player actually has. Run in SQL Editor.

create or replace function public.spin_wheel(
  p_player_id uuid,
  p_item_classname text,
  p_item_label text
)
returns table(reward_id uuid, spins_available integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available integer;
  v_reward_id uuid;
begin
  select players.spins_available into v_available
  from public.players
  where id = p_player_id
  for update;

  if v_available is null then
    raise exception 'player_not_found';
  end if;

  if v_available <= 0 then
    raise exception 'no_spins_available';
  end if;

  update public.players
  set spins_used_total = spins_used_total + 1, updated_at = now()
  where id = p_player_id;

  insert into public.rewards (player_id, item_classname, item_label)
  values (p_player_id, p_item_classname, p_item_label)
  returning id into v_reward_id;

  select players.spins_available into v_available
  from public.players
  where id = p_player_id;

  return query select v_reward_id, v_available;
end;
$$;
