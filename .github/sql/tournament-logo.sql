-- Tournoi des 9 Mondes — logo propre à l'événement.
--
-- Si `logo_url` est renseigné, il remplace le logo du jeu sur les cartes et
-- la fiche du tournoi ; sinon le logo du jeu est utilisé.

alter table public.nvg_tournaments
  add column if not exists logo_url text;
