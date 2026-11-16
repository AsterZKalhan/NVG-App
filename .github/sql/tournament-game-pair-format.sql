-- Tournoi des 9 Mondes — format du 2v2 et mode de score « aucun ».
--
-- `pair_format` décrit comment se joue un jeu à 2 joueurs en BO9 :
--   `two_bo1` (défaut) : deux BO1 de binômes (A1/A2 – B1/B2, A3/A4 – B3/B4),
--                        puis un départage 2v2 en BO1 si chaque équipe gagne
--                        un BO1 ;
--   `bo3`             : mêmes deux BO1, mais le départage 2v2 se joue en BO3
--                        (premier à 2 manches : 2–0, 2–1, 1–2 ou 0–2).
-- Le 5e joueur peut remplacer un des deux joueurs du binôme.
--
-- `scoring_mode` accepte désormais `none` : le mode du jeu n'a pas été
-- précisé. Il se comporte comme une confrontation classique dans les tournois.

alter table public.nvg_tournament_games
  drop constraint if exists nvg_tournament_games_scoring_mode_chk;

alter table public.nvg_tournament_games
  add constraint nvg_tournament_games_scoring_mode_chk
  check (scoring_mode in ('versus', 'cumulative', 'wins', 'none'));

alter table public.nvg_tournament_games
  add column if not exists pair_format text not null default 'two_bo1';

alter table public.nvg_tournament_games
  drop constraint if exists nvg_tournament_games_pair_format_chk;

alter table public.nvg_tournament_games
  add constraint nvg_tournament_games_pair_format_chk
  check (pair_format in ('two_bo1', 'bo3'));
