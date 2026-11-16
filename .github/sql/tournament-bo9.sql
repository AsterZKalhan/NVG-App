-- Tournoi des 9 Mondes — format BO9 « Décathlon Esport ».
-- Gestion locale des poules et du bracket (sans Toornament).
--
-- Un tournoi BO9 garde ses 9 jeux dans `nvg_tournaments.format_config` :
--   { "type": "bo9", "points_mode": "classic" | "allin",
--     "games": [{ "slot": 1, "category": "collectif", "game_id": "…",
--                 "units": 1, "points_per_unit": 3 }, …],
--     "pool_count": 4, "pool_size": 4, "qualifiers_per_pool": 2,
--     "pick_ban": true, "mercy": true, "captain_card": true,
--     "third_place": true }
--
-- Les tournois « jeu unique » existants conservent `format_config = null`.

alter table public.nvg_tournaments
  add column if not exists format_config jsonb;

create table if not exists public.nvg_tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.nvg_tournaments(id) on delete cascade,
  phase text not null default 'pool' check (phase in ('pool', 'bracket', 'third')),
  round integer not null default 1,
  position integer not null default 1,
  group_name text,
  label text,
  team_a uuid references public.nvg_tournament_teams(id) on delete set null,
  team_b uuid references public.nvg_tournament_teams(id) on delete set null,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'finished')),
  -- Scores par jeu : [{ "slot": 1, "units_a": 1, "units_b": 0 }, …]
  games jsonb not null default '[]'::jsonb,
  -- Ordre de jeu choisi au pick & ban : [4, 1, 7, …]
  pick_order jsonb,
  -- Cartes capitaines : { "a": 7, "b": null } (slot du duel doublé)
  captain_card jsonb not null default '{}'::jsonb,
  points_a numeric not null default 0,
  points_b numeric not null default 0,
  winner_team uuid references public.nvg_tournament_teams(id) on delete set null,
  mercy boolean not null default false,
  next_match_id uuid references public.nvg_tournament_matches(id) on delete set null,
  next_slot text check (next_slot in ('a', 'b')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nvg_tournament_matches_tournament_idx
  on public.nvg_tournament_matches (tournament_id, phase, round, position);

alter table public.nvg_tournament_matches enable row level security;

grant select on public.nvg_tournament_matches to anon, authenticated;
grant insert, update, delete on public.nvg_tournament_matches to authenticated;

drop policy if exists "matchs lecture publique" on public.nvg_tournament_matches;
create policy "matchs lecture publique"
  on public.nvg_tournament_matches for select
  using (
    public.nvg_is_admin()
    or exists (
      select 1 from public.nvg_tournaments t
      where t.id = tournament_id and t.published
    )
  );

drop policy if exists "matchs admin" on public.nvg_tournament_matches;
create policy "matchs admin"
  on public.nvg_tournament_matches for all
  using (public.nvg_is_admin())
  with check (public.nvg_is_admin());
