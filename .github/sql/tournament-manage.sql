-- Tournoi des 9 Mondes — page « Gestion tournoi » du joueur.
--
-- Le pseudo en jeu est propre à chaque joueur et à chaque tournoi : il est
-- stocké sur sa participation à l'évènement (`nvg_tournament_players`).
-- Le joueur peut le modifier lui-même, et seulement celui-là.

alter table public.nvg_tournament_players
  add column if not exists platform_id text;

alter table public.nvg_tournament_players
  drop constraint if exists nvg_tournament_players_platform_id_chk;

alter table public.nvg_tournament_players
  add constraint nvg_tournament_players_platform_id_chk
  check (platform_id is null or char_length(platform_id) <= 40);

drop policy if exists "joueurs evenement maj pseudo" on public.nvg_tournament_players;
create policy "joueurs evenement maj pseudo" on public.nvg_tournament_players
  for update to authenticated
  using (user_id = (auth.uid())::text)
  with check (user_id = (auth.uid())::text);

grant update (platform_id) on public.nvg_tournament_players to authenticated;
