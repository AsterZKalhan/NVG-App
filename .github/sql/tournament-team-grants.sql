-- Tournoi des 9 Mondes — droits de modification des équipes.
--
-- Les politiques RLS (capitaine ou admin) limitent déjà qui peut modifier ou
-- supprimer une équipe ; il manquait le droit de table UPDATE / DELETE pour le
-- rôle authenticated, ce qui faisait échouer ces actions sans message.

grant update, delete on public.nvg_tournament_teams to authenticated;
