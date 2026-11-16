-- Tournoi des 9 Mondes — changer le capitaine d'une équipe.
--
-- Le capitaine actuel ou un administrateur peut transférer le rôle à un
-- membre de l'équipe. L'inscription de l'équipe suit le nouveau capitaine.

create or replace function public.nvg_tournament_set_captain(p_team uuid, p_user text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid text := auth.uid()::text;
  v_old text;
begin
  if v_uid is null then
    raise exception 'connexion requise';
  end if;
  select captain_id into v_old from public.nvg_tournament_teams where id = p_team;
  if not found then
    raise exception 'équipe introuvable';
  end if;
  if v_uid <> v_old and not public.nvg_is_admin() then
    raise exception 'seul le capitaine ou un administrateur peut changer le capitaine';
  end if;
  if p_user = v_old then
    raise exception 'ce joueur est déjà capitaine';
  end if;
  if not exists (select 1 from public.nvg_tournament_team_members where team_id = p_team and user_id = p_user) then
    raise exception 'le nouveau capitaine doit être membre de l''équipe';
  end if;

  update public.nvg_tournament_team_members set role = 'member'
  where team_id = p_team and user_id = v_old;
  update public.nvg_tournament_team_members set role = 'captain'
  where team_id = p_team and user_id = p_user;
  update public.nvg_tournament_teams set captain_id = p_user where id = p_team;
  update public.nvg_tournament_registrations set user_id = p_user
  where team_id = p_team and user_id = v_old;
end;
$$;

grant execute on function public.nvg_tournament_set_captain(uuid, text) to authenticated;
