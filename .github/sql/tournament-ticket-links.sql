-- Tournoi des 9 Mondes — boutons de billetterie configurables par tournoi.
--
-- ticket_url_player : lien du « 1 pass joueur » (bouton « Je prends mon billet »).
-- ticket_url_team   : lien du « 1 pass équipe » (bouton « Je prends un pass équipe »,
--                     le capitaine paie pour tous les joueurs de son équipe).
-- Le lien payment_url existant devient le lien du pass joueur ; la colonne reste en
-- place pour ne rien perdre.

alter table public.nvg_tournaments
  add column if not exists ticket_url_player text;

alter table public.nvg_tournaments
  add column if not exists ticket_url_team text;

update public.nvg_tournaments
set ticket_url_player = payment_url
where ticket_url_player is null
  and payment_url is not null;
