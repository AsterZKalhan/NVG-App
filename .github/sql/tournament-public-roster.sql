-- Tournoi des 9 Mondes — liste publique des inscrits (onglet « Liste des inscrits »).
--
-- Renvoie, pour un tournoi publié, les inscriptions actives avec : nom d'équipe ou
-- pseudo du site, tag, logo de l'équipe, statut (préinscrit / confirmé), nombre de
-- joueurs ayant réglé, et pseudos des membres. Aucune donnée personnelle (nom,
-- prénom, date de naissance, e-mail) ni état de paiement joueur par joueur n'est exposé.

drop function if exists public.nvg_tournament_public_roster(uuid);

create or replace function public.nvg_tournament_public_roster(p_tournament uuid)
returns table (
  team_id uuid,
  name text,
  tag text,
  logo_url text,
  status text,
  members_count int,
  paid_members int,
  solo_paid boolean,
  members jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    r.team_id,
    coalesce(te.name, u.name, 'Joueur') as name,
    te.tag,
    te.logo_url,
    r.status,
    coalesce((select count(*) from public.nvg_tournament_team_members m where m.team_id = r.team_id), 0)::int as members_count,
    coalesce((
      select count(*)
      from public.nvg_tournament_team_members m
      join public.nvg_tournament_players p on p.user_id = m.user_id and p.tournament_id = r.tournament_id
      where m.team_id = r.team_id and p.payment_status = 'paid'
    ), 0)::int as paid_members,
    (r.team_id is null and r.payment_status = 'paid') as solo_paid,
    coalesce((
      select jsonb_agg(jsonb_build_object('pseudo', mu.name) order by mu.name)
      from public.nvg_tournament_team_members m
      join public.nvg_users mu on mu.id = m.user_id
      where m.team_id = r.team_id
    ), '[]'::jsonb) as members
  from public.nvg_tournament_registrations r
  join public.nvg_tournaments tr on tr.id = r.tournament_id and tr.published
  left join public.nvg_tournament_teams te on te.id = r.team_id
  left join public.nvg_users u on u.id = r.user_id
  where r.tournament_id = p_tournament
    and r.status in ('pending', 'confirmed')
  order by te.name nulls last, u.name;
$$;

revoke all on function public.nvg_tournament_public_roster(uuid) from public;
grant execute on function public.nvg_tournament_public_roster(uuid) to anon, authenticated;
