-- Tournoi des 9 Mondes — gestion des équipes.
--
-- 1. Un joueur doit d'abord « rejoindre l'évènement » (table
--    nvg_tournament_players) avant de créer une équipe. Un joueur qui rejoint
--    une équipe par code est ajouté à l'évènement automatiquement.
-- 2. Une équipe a un logo (`logo_url`), un nom, un tag et un code d'invitation.
--    Une équipe ne contient jamais plus de `team_max` joueurs (5 pour le BO9).
-- 3. L'admin peut modifier une équipe, retirer un membre (hors capitaine),
--    supprimer une équipe et retirer un joueur de l'évènement.

alter table public.nvg_tournament_teams
  add column if not exists logo_url text;

create table if not exists public.nvg_tournament_players (
  tournament_id uuid not null references public.nvg_tournaments(id) on delete cascade,
  user_id text not null references public.nvg_users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (tournament_id, user_id)
);

alter table public.nvg_tournament_players enable row level security;

drop policy if exists "joueurs evenement lecture" on public.nvg_tournament_players;
create policy "joueurs evenement lecture" on public.nvg_tournament_players
  for select to authenticated
  using (user_id = (auth.uid())::text or public.nvg_is_admin());

drop policy if exists "joueurs evenement retrait admin" on public.nvg_tournament_players;
create policy "joueurs evenement retrait admin" on public.nvg_tournament_players
  for delete to authenticated
  using (public.nvg_is_admin());

grant select, delete on public.nvg_tournament_players to authenticated;

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
  insert into public.nvg_tournament_players (tournament_id, user_id)
  values (p_tournament, v_uid)
  on conflict do nothing;
end;
$$;

grant execute on function public.nvg_tournament_join_event(uuid) to authenticated;

-- Création d'équipe : il faut avoir rejoint l'évènement, et le logo est optionnel.
drop function if exists public.nvg_tournament_create_team(uuid, text, text);

create or replace function public.nvg_tournament_create_team(p_tournament uuid, p_name text, p_tag text default null, p_logo text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid text := auth.uid()::text;
  v_t record;
  v_code text;
  v_team uuid;
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
  if not exists (
    select 1 from public.nvg_tournament_players
    where tournament_id = p_tournament and user_id = v_uid
  ) then
    raise exception 'rejoins d''abord l''évènement pour créer une équipe';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'le nom de l''équipe est obligatoire';
  end if;
  if char_length(trim(p_name)) < 2 or char_length(trim(p_name)) > 60 then
    raise exception 'le nom de l''équipe doit contenir entre 2 et 60 caractères';
  end if;
  if char_length(coalesce(trim(p_tag), '')) > 10 then
    raise exception 'le tag de l''équipe ne doit pas dépasser 10 caractères';
  end if;
  if p_logo is not null and p_logo !~ '^https://' then
    raise exception 'le logo doit être une adresse https';
  end if;
  if exists (
    select 1
    from public.nvg_tournament_team_members m
    join public.nvg_tournament_teams t on t.id = m.team_id
    where t.tournament_id = p_tournament
      and m.user_id = v_uid
  ) then
    raise exception 'tu fais déjà partie d''une équipe pour ce tournoi';
  end if;

  loop
    v_code := lower(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from public.nvg_tournament_teams where invite_code = v_code);
  end loop;

  insert into public.nvg_tournament_teams (tournament_id, name, tag, captain_id, invite_code, logo_url)
  values (p_tournament, trim(p_name), nullif(trim(p_tag), ''), v_uid, v_code, nullif(trim(coalesce(p_logo, '')), ''))
  returning id into v_team;

  insert into public.nvg_tournament_team_members (team_id, user_id, role)
  values (v_team, v_uid, 'captain');

  return jsonb_build_object('team_id', v_team, 'invite_code', v_code);
exception
  when unique_violation then
    raise exception 'une équipe porte déjà ce nom dans ce tournoi';
end;
$$;

grant execute on function public.nvg_tournament_create_team(uuid, text, text, text) to authenticated;

-- Rejoindre par code : ajoute aussi le joueur à l'évènement.
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

  insert into public.nvg_tournament_players (tournament_id, user_id)
  values (v_team.tournament_id, v_uid)
  on conflict do nothing;

  insert into public.nvg_tournament_team_members (team_id, user_id, role)
  values (v_team.id, v_uid, 'member');

  return jsonb_build_object('team_id', v_team.id, 'already_member', false);
end;
$$;

-- Admin : retirer un membre (le capitaine ne peut pas être retiré).
create or replace function public.nvg_admin_remove_team_member(p_team uuid, p_user text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.nvg_is_admin() then
    raise exception 'réservé aux administrateurs';
  end if;
  if exists (select 1 from public.nvg_tournament_teams where id = p_team and captain_id = p_user) then
    raise exception 'le capitaine ne peut pas être retiré de son équipe';
  end if;
  delete from public.nvg_tournament_team_members
  where team_id = p_team and user_id = p_user;
end;
$$;

grant execute on function public.nvg_admin_remove_team_member(uuid, text) to authenticated;
