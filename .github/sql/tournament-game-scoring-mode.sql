-- Tournoi des 9 Mondes — mode de score rattaché au jeu.
--
-- `versus`     : confrontation classique, une équipe remporte le jeu
--                (unités gagnées, barème BO9 habituel) ;
-- `cumulative` : tous les joueurs des deux équipes jouent ensemble
--                (ex. Trackmania en time attack, 1v1v1v1…). L'admin saisit le
--                total de points de chaque équipe ; le plus haut total remporte
--                les points du jeu. En cas d'égalité, les points du jeu sont
--                partagés.

alter table public.nvg_tournament_games
  add column if not exists scoring_mode text not null default 'versus';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nvg_tournament_games_scoring_mode_chk') then
    alter table public.nvg_tournament_games add constraint nvg_tournament_games_scoring_mode_chk
      check (scoring_mode in ('versus', 'cumulative'));
  end if;
end $$;
