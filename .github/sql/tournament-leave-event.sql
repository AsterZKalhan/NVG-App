-- Tournoi des 9 Mondes — quitter l'évènement.
--
-- Un joueur peut quitter un évènement en équipe tant qu'il n'est ni dans une
-- équipe de ce tournoi, ni inscrit (en solo, ou comme capitaine d'une équipe).

create or replace function public.nvg_tournament_leave_event(p_tournament uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid text := auth.uid()::text;
begin
  if v_uid is null then
    raise exception 'connexion requise';
  end if;
  if exists (
    select 1
    from public.nvg_tournament_team_members m
    join public.nvg_tournament_teams t on t.id = m.team_id
    where t.tournament_id = p_tournament and m.user_id = v_uid
  ) then
    raise exception 'quitte d''abord ton équipe pour quitter l''évènement';
  end if;
  if exists (
    select 1 from public.nvg_tournament_registrations
    where tournament_id = p_tournament and user_id = v_uid and status <> 'cancelled'
  ) then
    raise exception 'annule d''abord ton inscription au tournoi';
  end if;
  delete from public.nvg_tournament_players
  where tournament_id = p_tournament and user_id = v_uid;
end;
$$;

grant execute on function public.nvg_tournament_leave_event(uuid) to authenticated;
