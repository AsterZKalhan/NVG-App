-- Tournoi des 9 Mondes — logo des équipes dans la vue publique.
--
-- Les arbres et les cartes de match affichent le logo de l'équipe devant son nom.
-- La colonne logo_url est ajoutée en fin de vue (aucune autre colonne ne change).

create or replace view public.nvg_tournament_teams_public as
select
  t.id,
  t.tournament_id,
  t.name,
  t.tag,
  count(m.user_id)::int as member_count,
  t.created_at,
  t.logo_url
from public.nvg_tournament_teams t
join public.nvg_tournaments tr on tr.id = t.tournament_id and tr.published
left join public.nvg_tournament_team_members m on m.team_id = t.id
group by t.id;

grant select on public.nvg_tournament_teams_public to anon, authenticated;
