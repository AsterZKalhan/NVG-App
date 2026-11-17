-- Tournoi des 9 Mondes — état du billet des joueurs dans « Mes équipes ».
--
-- Les lignes de nvg_tournament_players ne sont lisibles que par le joueur
-- concerné ou par un admin (RLS). Les coéquipiers doivent pourtant voir qui a
-- réglé son billet pour le tournoi en cours : cette fonction SECURITY DEFINER
-- expose uniquement l'état de paiement des membres de l'équipe, et seulement
-- aux membres de cette équipe ou à un admin. Aucune identité, aucun e-mail et
-- aucune référence de paiement ne sont renvoyés.

create or replace function public.nvg_tournament_team_payments(p_team uuid)
returns table (user_id text, payment_status text, paid_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id, p.payment_status, p.paid_at
  from public.nvg_tournament_team_members m
  join public.nvg_tournament_teams t on t.id = m.team_id
  join public.nvg_tournament_players p
    on p.tournament_id = t.tournament_id
   and p.user_id = m.user_id
  where m.team_id = p_team
    and (public.nvg_tournament_is_team_member(p_team) or public.nvg_is_admin());
$$;

revoke all on function public.nvg_tournament_team_payments(uuid) from public;
grant execute on function public.nvg_tournament_team_payments(uuid) to authenticated;
