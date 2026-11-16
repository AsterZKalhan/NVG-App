-- Suppression du compte depuis l'espace membre.
--
-- Le compte est partagé entre l'application, le bot et le tournoi : la suppression
-- retire le compte pour tous ces espaces. La fonction refuse si une situation
-- engage l'organisation (inscription active, billet payé, capitaine d'une équipe
-- avec d'autres membres). Le code de validation est vérifié côté client, avant
-- l'appel (OTP envoyé par e-mail à l'adresse du compte).

create or replace function public.nvg_delete_my_account()
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_uid text := auth.uid()::text;
begin
  if v_uid is null then
    raise exception 'connexion requise';
  end if;
  if exists (
    select 1 from public.nvg_tournament_registrations
    where user_id = v_uid and status <> 'cancelled'
  ) then
    raise exception 'annule d''abord tes inscriptions aux tournois, ou contacte l''organisation';
  end if;
  if exists (
    select 1 from public.nvg_tournament_players
    where user_id = v_uid and payment_status = 'paid'
  ) then
    raise exception 'un billet payé est lié à ton compte : contacte l''organisation pour un remboursement avant de supprimer ton compte';
  end if;
  if exists (
    select 1
    from public.nvg_tournament_teams t
    join public.nvg_tournament_team_members m on m.team_id = t.id
    where t.captain_id = v_uid and m.user_id <> v_uid
  ) then
    raise exception 'tu es capitaine d''une équipe avec des membres : passe le capitanat à un autre membre ou dissous l''équipe';
  end if;

  delete from public.nvg_tournament_players where user_id = v_uid;
  delete from public.nvg_users where id = v_uid;
  delete from auth.users where id = v_uid::uuid;
end;
$$;

grant execute on function public.nvg_delete_my_account() to authenticated;
