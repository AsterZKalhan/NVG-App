-- Tournoi des 9 Mondes — modes de score « aucun » et « BO3 2v2 ».
--
-- `scoring_mode` accepte désormais :
--   `versus`     : confrontation classique, une équipe gagne le jeu ;
--   `cumulative` : total de points des joueurs (ex. Trackmania en time attack) ;
--   `wins`       : victoires individuelles en 1v1 (ex. Hearthstone) ;
--   `none`       : mode non précisé, comportement de confrontation ;
--   `bo3`        : BO3 2v2 — deux BO1 de binômes, puis départage 2v2 en BO3
--                  (premier à 2 manches) si chaque équipe gagne un BO1.
--
-- Le format BO3 est porté par le mode de score du jeu ; la colonne
-- `pair_format` introduite puis remplacée est supprimée.

alter table public.nvg_tournament_games
  drop constraint if exists nvg_tournament_games_scoring_mode_chk;

alter table public.nvg_tournament_games
  add constraint nvg_tournament_games_scoring_mode_chk
  check (scoring_mode in ('versus', 'cumulative', 'wins', 'none', 'bo3'));

alter table public.nvg_tournament_games
  drop constraint if exists nvg_tournament_games_pair_format_chk;

alter table public.nvg_tournament_games
  drop column if exists pair_format;
