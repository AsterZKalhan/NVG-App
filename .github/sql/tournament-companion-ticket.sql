-- Tournoi des 9 Mondes — lien de billetterie du pass accompagnant.
--
-- ticket_url_companion : lien du « pass accompagnant ». L'écran d'inscription
-- propose « Je suis accompagnant », qui ouvre directement ce lien sans créer
-- d'inscription de joueur.

alter table public.nvg_tournaments
  add column if not exists ticket_url_companion text;
