-- Tournoi des 9 Mondes — une équipe complète ne peut plus être rejointe par code.
--
-- Le nombre de joueurs de l'équipe est compté au moment du join, l'équipe étant
-- verrouillée pour que deux joueurs ne puissent pas prendre la dernière place
-- en même temps. Une équipe déjà complète (team_max joueurs) refuse le join avec
-- « l'équipe est déjà complète ».

create or replace function public.nvg_tournament_join_team(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid text := auth.uid()::text;
  v_team record;
  v_t record;
  v_count int;
begin
  if v_uid is null then
    raise exception 'connexion requise';
  end if;

  select * into v_team
  from public.nvg_tournament_teams
  where invite_code = lower(trim(p_code))
  for update;
  if not found then
    raise exception 'code d''invitation invalide';
  end if;

  select * into v_t from public.nvg_tournaments where id = v_team.tournament_id and published;
  if not found then
    raise exception 'tournoi introuvable';
  end if;
  if v_t.status <> 'open' then
    raise exception 'les inscriptions sont fermées';
  end if;

  if exists (
    select 1 from public.nvg_tournament_team_members
    where team_id = v_team.id and user_id = v_uid
  ) then
    return jsonb_build_object('team_id', v_team.id, 'already_member', true);
  end if;

  if exists (
    select 1
    from public.nvg_tournament_team_members m
    join public.nvg_tournament_teams t on t.id = m.team_id
    where t.tournament_id = v_team.tournament_id
      and m.user_id = v_uid
  ) then
    raise exception 'tu fais déjà partie d''une équipe pour ce tournoi';
  end if;

  select count(*) into v_count
  from public.nvg_tournament_team_members
  where team_id = v_team.id;
  if v_count >= v_t.team_max then
    raise exception 'l''équipe est déjà complète (% joueurs maximum)', v_t.team_max;
  end if;

  insert into public.nvg_tournament_players (tournament_id, user_id, payment_status)
  values (v_team.tournament_id, v_uid, public.nvg_player_payment_default(v_team.tournament_id))
  on conflict do nothing;

  insert into public.nvg_tournament_team_members (team_id, user_id, role)
  values (v_team.id, v_uid, 'member');

  return jsonb_build_object('team_id', v_team.id, 'already_member', false);
end;
$$;

revoke all on function public.nvg_tournament_join_team(text) from public;
grant execute on function public.nvg_tournament_join_team(text) to authenticated;
