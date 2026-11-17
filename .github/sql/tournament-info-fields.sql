-- Tournoi des 9 Mondes — informations pratiques affichées dans la fiche.
--
-- venue          : lieu (nom et adresse de la salle), pour les évènements LAN.
-- food_info      : restauration sur place (horaires, prix, types de repas).
-- room_plan_url  : lien vers le plan de la salle (image ou PDF).
-- info_notes     : autres informations (parking, arrivée, matériel à apporter…).

alter table public.nvg_tournaments add column if not exists venue text;
alter table public.nvg_tournaments add column if not exists food_info text;
alter table public.nvg_tournaments add column if not exists room_plan_url text;
alter table public.nvg_tournaments add column if not exists info_notes text;
