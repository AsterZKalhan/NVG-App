-- Tournoi des 9 Mondes — nombre de joueurs par équipe rattaché au jeu.
--
-- Permet de décrire un jeu une seule fois (ex. League of Legends = 5v5) :
-- le formulaire de création de tournoi reprend ensuite cette valeur.
-- `null` = non précisé (l'organisateur choisit librement).

alter table public.nvg_tournament_games
  add column if not exists team_size integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nvg_tournament_games_team_size_chk') then
    alter table public.nvg_tournament_games add constraint nvg_tournament_games_team_size_chk
      check (team_size is null or team_size between 1 and 6);
  end if;
end $$;
