-- Tournoi des 9 Mondes — paiement par joueur (billet) dans les équipes.
--
-- Chaque joueur de l'évènement a son propre état de paiement : il prend son
-- billet, l'admin le marque payé, remboursé ou remet le paiement en attente.

alter table public.nvg_tournament_players
  add column if not exists payment_status text not null default 'not_required';

alter table public.nvg_tournament_players
  add column if not exists payment_reference text;

alter table public.nvg_tournament_players
  add column if not exists paid_at timestamptz;

alter table public.nvg_tournament_players
  drop constraint if exists nvg_tournament_players_payment_status_chk;

alter table public.nvg_tournament_players
  add constraint nvg_tournament_players_payment_status_chk
  check (payment_status in ('not_required', 'awaiting', 'paid', 'refunded'));

drop policy if exists "joueurs evenement paiement admin" on public.nvg_tournament_players;
create policy "joueurs evenement paiement admin" on public.nvg_tournament_players
  for update to authenticated
  using (public.nvg_is_admin())
  with check (public.nvg_is_admin());

grant update (payment_status, payment_reference, paid_at) on public.nvg_tournament_players to authenticated;

-- Participations existantes : en attente si le tournoi est payant.
update public.nvg_tournament_players p
set payment_status = 'awaiting'
from public.nvg_tournaments t
where t.id = p.tournament_id
  and coalesce(t.entry_fee_cents, 0) > 0
  and p.payment_status = 'not_required';

-- Un joueur qui rejoint l'évènement (directement ou par code) reçoit l'état
-- de paiement du tournoi : en attente si le tournoi est payant.
create or replace function public.nvg_player_payment_default(p_tournament uuid)
returns text
language sql
stable
set search_path to 'public'
as $$
  select case when coalesce(entry_fee_cents, 0) > 0 then 'awaiting' else 'not_required' end
  from public.nvg_tournaments where id = p_tournament;
$$;

create or replace function public.nvg_tournament_join_event(p_tournament uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid text := auth.uid()::text;
  v_t record;
begin
  if v_uid is null then
    raise exception 'connexion requise';
  end if;
  select * into v_t from public.nvg_tournaments where id = p_tournament and published;
  if not found then
    raise exception 'tournoi introuvable';
  end if;
  if v_t.mode <> 'team' then
    raise exception 'ce tournoi se joue en solo';
  end if;
  if v_t.status <> 'open' then
    raise exception 'les inscriptions sont fermées';
  end if;
  insert into public.nvg_tournament_players (tournament_id, user_id, payment_status)
  values (p_tournament, v_uid, public.nvg_player_payment_default(p_tournament))
  on conflict do nothing;
end;
$$;

create or replace function public.nvg_tournament_join_team(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid text := auth.uid()::text;
  v_team record;
  v_t record;
  v_count int;
begin
  if v_uid is null then
    raise exception 'connexion requise';
  end if;

  select * into v_team
  from public.nvg_tournament_teams
  where invite_code = lower(trim(p_code));
  if not found then
    raise exception 'code d''invitation invalide';
  end if;

  select * into v_t from public.nvg_tournaments where id = v_team.tournament_id and published;
  if not found then
    raise exception 'tournoi introuvable';
  end if;
  if v_t.status <> 'open' then
    raise exception 'les inscriptions sont fermées';
  end if;

  if exists (
    select 1 from public.nvg_tournament_team_members
    where team_id = v_team.id and user_id = v_uid
  ) then
    return jsonb_build_object('team_id', v_team.id, 'already_member', true);
  end if;

  if exists (
    select 1
    from public.nvg_tournament_team_members m
    join public.nvg_tournament_teams t on t.id = m.team_id
    where t.tournament_id = v_team.tournament_id
      and m.user_id = v_uid
  ) then
    raise exception 'tu fais déjà partie d''une équipe pour ce tournoi';
  end if;

  select count(*) into v_count
  from public.nvg_tournament_team_members
  where team_id = v_team.id;
  if v_count >= v_t.team_max then
    raise exception 'cette équipe est complète (% joueurs maximum)', v_t.team_max;
  end if;

  insert into public.nvg_tournament_players (tournament_id, user_id, payment_status)
  values (v_team.tournament_id, v_uid, public.nvg_player_payment_default(v_team.tournament_id))
  on conflict do nothing;

  insert into public.nvg_tournament_team_members (team_id, user_id, role)
  values (v_team.id, v_uid, 'member');

  return jsonb_build_object('team_id', v_team.id, 'already_member', false);
end;
$$;
