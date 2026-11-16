-- Tournoi des 9 Mondes — mode de score « victoires individuelles ».
--
-- `versus`     : confrontation classique, une équipe gagne le jeu ;
-- `cumulative` : total de points des joueurs (ex. Trackmania en time attack) ;
-- `wins`       : chaque joueur affronte son homologue en 1v1 (A1–B1, A2–B2…).
--                L'admin saisit le nombre de duels gagnés par chaque équipe ;
--                l'équipe qui en gagne le plus remporte le jeu (ex. Hearthstone
--                sur 5 joueurs). Égalité = points du jeu partagés.

alter table public.nvg_tournament_games
  drop constraint if exists nvg_tournament_games_scoring_mode_chk;

alter table public.nvg_tournament_games
  add constraint nvg_tournament_games_scoring_mode_chk
  check (scoring_mode in ('versus', 'cumulative', 'wins'));
