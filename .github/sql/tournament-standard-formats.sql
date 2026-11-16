-- Tournoi des 9 Mondes — liens « perdant » pour la double élimination.
--
-- Un match de tableau gagnant envoie son vainqueur vers `next_match_id`
-- (emplacement `next_slot`) et son perdant vers `loser_next_match_id`
-- (emplacement `loser_next_slot`), dans le repêchage. Les autres formats
-- standard n'utilisent que `next_*`.

alter table public.nvg_tournament_matches
  add column if not exists loser_next_match_id uuid references public.nvg_tournament_matches(id) on delete set null;

alter table public.nvg_tournament_matches
  add column if not exists loser_next_slot text;

alter table public.nvg_tournament_matches
  drop constraint if exists nvg_tournament_matches_loser_next_slot_chk;

alter table public.nvg_tournament_matches
  add constraint nvg_tournament_matches_loser_next_slot_chk
  check (loser_next_slot is null or loser_next_slot in ('a', 'b'));

-- Phases : `bracket` (tableau), `third` (petite finale), `pool` (poules,
-- championnat, suisse), `winners` / `losers` / `grand` (double élimination).
alter table public.nvg_tournament_matches
  drop constraint if exists nvg_tournament_matches_phase_check;

alter table public.nvg_tournament_matches
  add constraint nvg_tournament_matches_phase_check
  check (phase in ('pool', 'bracket', 'third', 'winners', 'losers', 'grand'));
