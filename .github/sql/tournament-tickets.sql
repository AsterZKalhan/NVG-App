-- Tournoi des 9 Mondes — billets Weezevent synchronisés.
--
-- Une ligne par billet Weezevent (un billet équipe = une ligne avec ses 5 joueurs).
-- Remplie par la fonction serveur weezevent-sync (clé de service) ; lecture réservée aux admins.
-- Rien n'est supprimé automatiquement : à la fin du tournoi, la synchronisation s'arrête et les
-- billets restent consultables (archive).

-- Événement Weezevent lié au tournoi (identifiant numérique, ex. 2598465).
alter table public.nvg_tournaments add column if not exists weez_event_id text;

-- Origine du statut « payé » : 'weezevent' si posé par la synchronisation, sinon saisi à la main.
alter table public.nvg_tournament_players add column if not exists payment_source text;

create table if not exists public.nvg_tournament_tickets (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.nvg_tournaments(id),
  weez_event_id text not null,
  barcode text not null,
  ticket_ref text,
  order_ref text,
  ticket_id text,
  ticket_name text,
  first_name text,
  last_name text,
  email text,
  pseudo text,
  buyer_name text,
  buyer_email text,
  paid boolean not null default false,
  deleted boolean not null default false,
  scanned text,
  scan_date text,
  create_date text,
  user_id text references public.nvg_users(id) on delete set null,
  match_source text,
  members jsonb not null default '[]'::jsonb,
  synced_at timestamptz not null default now(),
  unique (weez_event_id, barcode)
);

create index if not exists nvg_tournament_tickets_tournament_idx on public.nvg_tournament_tickets (tournament_id);
create index if not exists nvg_tournament_tickets_user_idx on public.nvg_tournament_tickets (user_id);

alter table public.nvg_tournament_tickets enable row level security;

drop policy if exists "tickets admin read" on public.nvg_tournament_tickets;
create policy "tickets admin read" on public.nvg_tournament_tickets
  for select to authenticated using (public.nvg_is_admin());

grant select on public.nvg_tournament_tickets to authenticated;
