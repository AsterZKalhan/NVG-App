-- Tournoi des 9 Mondes : jeux, tournois, équipes, membres et inscriptions.
-- Les écritures sensibles passent par des fonctions SECURITY DEFINER :
-- création d'équipe, rejoindre par code, inscription solo ou équipe, annulation.
-- Le navigateur ne décide jamais des droits.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.nvg_tournament_games (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  banner_url text,
  created_at timestamptz not null default now()
);

-- Visuels du jeu : logo carré et bannière large, téléversés depuis le
-- back-office dans le bucket public `games-img` (voir plus bas).
alter table public.nvg_tournament_games add column if not exists banner_url text;

create table if not exists public.nvg_tournaments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  game_id uuid references public.nvg_tournament_games(id) on delete set null,
  description text,
  rules text,
  mode text not null default 'team' check (mode in ('solo', 'team')),
  format text not null default 'online' check (format in ('online', 'lan', 'both')),
  team_min int not null default 1 check (team_min between 1 and 20),
  team_max int not null default 1 check (team_max between 1 and 20),
  max_participants int check (max_participants is null or max_participants > 0),
  prize text,
  prize_first text,
  prize_second text,
  prize_third text,
  starts_at timestamptz,
  ends_at timestamptz,
  registration_closes_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed', 'running', 'finished', 'cancelled')),
  published boolean not null default false,
  banner_url text,
  toornament_url text,
  toornament_id text,
  created_at timestamptz not null default now()
);

-- Visuels et liaison Toornament (colonnes ajoutées après la première mise en
-- production) : bannière affichée en haut de la fiche, page publique du
-- tournoi et identifiant Toornament pour la future synchronisation API.
alter table public.nvg_tournaments add column if not exists banner_url text;
alter table public.nvg_tournaments add column if not exists toornament_url text;
alter table public.nvg_tournaments add column if not exists toornament_id text;
alter table public.nvg_tournaments add column if not exists prize_first text;
alter table public.nvg_tournaments add column if not exists prize_second text;
alter table public.nvg_tournaments add column if not exists prize_third text;

-- Reprise de l'ancien champ unique `prize` vers la 1re place.
update public.nvg_tournaments
   set prize_first = prize
 where prize_first is null and prize is not null;

create index if not exists nvg_tournaments_toornament_id_idx
  on public.nvg_tournaments (toornament_id);

create table if not exists public.nvg_tournament_teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.nvg_tournaments(id) on delete cascade,
  name text not null,
  tag text,
  captain_id text not null references public.nvg_users(id) on delete cascade,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create unique index if not exists nvg_tournament_teams_name_idx
  on public.nvg_tournament_teams (tournament_id, lower(name));

create table if not exists public.nvg_tournament_team_members (
  team_id uuid not null references public.nvg_tournament_teams(id) on delete cascade,
  user_id text not null references public.nvg_users(id) on delete cascade,
  role text not null default 'member' check (role in ('captain', 'member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index if not exists nvg_tournament_team_members_user_idx
  on public.nvg_tournament_team_members (user_id);

create table if not exists public.nvg_tournament_registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.nvg_tournaments(id) on delete cascade,
  user_id text not null references public.nvg_users(id) on delete cascade,
  team_id uuid references public.nvg_tournament_teams(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'waitlist', 'cancelled')),
  platform_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists nvg_tournament_reg_solo_idx
  on public.nvg_tournament_registrations (tournament_id, user_id)
  where team_id is null and status <> 'cancelled';

create unique index if not exists nvg_tournament_reg_team_idx
  on public.nvg_tournament_registrations (tournament_id, team_id)
  where team_id is not null and status <> 'cancelled';

-- ---------------------------------------------------------------------------
-- Fonction d'appartenance à une équipe (utilisée par les policies RLS)
-- ---------------------------------------------------------------------------

create or replace function public.nvg_tournament_is_team_member(p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.nvg_tournament_team_members
    where team_id = p_team
      and user_id = auth.uid()::text
  );
$$;

revoke all on function public.nvg_tournament_is_team_member(uuid) from public;
grant execute on function public.nvg_tournament_is_team_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Droits de lecture / écriture (RLS)
-- ---------------------------------------------------------------------------

alter table public.nvg_tournament_games enable row level security;
alter table public.nvg_tournaments enable row level security;
alter table public.nvg_tournament_teams enable row level security;
alter table public.nvg_tournament_team_members enable row level security;
alter table public.nvg_tournament_registrations enable row level security;

grant select on public.nvg_tournament_games, public.nvg_tournaments,
  public.nvg_tournament_teams, public.nvg_tournament_team_members,
  public.nvg_tournament_registrations to anon, authenticated;

grant insert, update, delete on public.nvg_tournament_games, public.nvg_tournaments to authenticated;
grant update, delete on public.nvg_tournament_registrations to authenticated;
-- Les équipes et leurs membres ne sont modifiés que par les fonctions
-- SECURITY DEFINER (création, code d'invitation, départ, dissolution).
revoke update, delete on public.nvg_tournament_teams from authenticated;
revoke insert, update, delete on public.nvg_tournament_team_members from authenticated;

drop policy if exists "jeux lecture publique" on public.nvg_tournament_games;
create policy "jeux lecture publique"
  on public.nvg_tournament_games for select
  using (true);

drop policy if exists "jeux admin" on public.nvg_tournament_games;
create policy "jeux admin"
  on public.nvg_tournament_games for all
  to authenticated
  using (public.nvg_is_admin())
  with check (public.nvg_is_admin());

drop policy if exists "tournois lecture" on public.nvg_tournaments;
create policy "tournois lecture"
  on public.nvg_tournaments for select
  using (published or public.nvg_is_admin());

drop policy if exists "tournois admin" on public.nvg_tournaments;
create policy "tournois admin"
  on public.nvg_tournaments for all
  to authenticated
  using (public.nvg_is_admin())
  with check (public.nvg_is_admin());

-- Le code d'invitation ne doit jamais être lisible par un simple SELECT.
-- La table n'est visible qu'aux membres de l'équipe et aux admins.
drop policy if exists "equipes membres" on public.nvg_tournament_teams;
create policy "equipes membres"
  on public.nvg_tournament_teams for select
  using (
    captain_id = auth.uid()::text
    or public.nvg_tournament_is_team_member(id)
    or public.nvg_is_admin()
  );

drop policy if exists "equipes capitaine maj" on public.nvg_tournament_teams;
create policy "equipes capitaine maj"
  on public.nvg_tournament_teams for update
  to authenticated
  using (captain_id = auth.uid()::text or public.nvg_is_admin())
  with check (captain_id = auth.uid()::text or public.nvg_is_admin());

drop policy if exists "equipes capitaine suppression" on public.nvg_tournament_teams;
create policy "equipes capitaine suppression"
  on public.nvg_tournament_teams for delete
  to authenticated
  using (captain_id = auth.uid()::text or public.nvg_is_admin());

drop policy if exists "membres equipe" on public.nvg_tournament_team_members;
create policy "membres equipe"
  on public.nvg_tournament_team_members for select
  using (
    user_id = auth.uid()::text
    or public.nvg_tournament_is_team_member(team_id)
    or public.nvg_is_admin()
  );

drop policy if exists "inscriptions membres" on public.nvg_tournament_registrations;
create policy "inscriptions membres"
  on public.nvg_tournament_registrations for select
  using (
    user_id = auth.uid()::text
    or (team_id is not null and public.nvg_tournament_is_team_member(team_id))
    or public.nvg_is_admin()
  );

drop policy if exists "inscriptions admin maj" on public.nvg_tournament_registrations;
create policy "inscriptions admin maj"
  on public.nvg_tournament_registrations for update
  to authenticated
  using (public.nvg_is_admin())
  with check (public.nvg_is_admin());

drop policy if exists "inscriptions admin suppression" on public.nvg_tournament_registrations;
create policy "inscriptions admin suppression"
  on public.nvg_tournament_registrations for delete
  to authenticated
  using (public.nvg_is_admin());

-- ---------------------------------------------------------------------------
-- Fonctions
-- ---------------------------------------------------------------------------

create or replace function public.nvg_tournament_create_team(
  p_tournament uuid,
  p_name text,
  p_tag text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
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
  if coalesce(trim(p_name), '') = '' then
    raise exception 'le nom de l''équipe est obligatoire';
  end if;
  if char_length(trim(p_name)) < 2 or char_length(trim(p_name)) > 60 then
    raise exception 'le nom de l''équipe doit contenir entre 2 et 60 caractères';
  end if;
  if char_length(coalesce(trim(p_tag), '')) > 10 then
    raise exception 'le tag de l''équipe ne doit pas dépasser 10 caractères';
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

  insert into public.nvg_tournament_teams (tournament_id, name, tag, captain_id, invite_code)
  values (p_tournament, trim(p_name), nullif(trim(p_tag), ''), v_uid, v_code)
  returning id into v_team;

  insert into public.nvg_tournament_team_members (team_id, user_id, role)
  values (v_team, v_uid, 'captain');

  return jsonb_build_object('team_id', v_team, 'invite_code', v_code);
exception
  when unique_violation then
    raise exception 'une équipe porte déjà ce nom dans ce tournoi';
end;
$$;

revoke all on function public.nvg_tournament_create_team(uuid, text, text) from public;
grant execute on function public.nvg_tournament_create_team(uuid, text, text) to authenticated;

create or replace function public.nvg_tournament_join_team(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
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
    raise exception 'cette équipe est complète';
  end if;

  insert into public.nvg_tournament_team_members (team_id, user_id, role)
  values (v_team.id, v_uid, 'member');

  return jsonb_build_object('team_id', v_team.id, 'already_member', false);
end;
$$;

revoke all on function public.nvg_tournament_join_team(text) from public;
grant execute on function public.nvg_tournament_join_team(text) to authenticated;

create or replace function public.nvg_tournament_leave_team(p_team uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_captain text;
begin
  if v_uid is null then
    raise exception 'connexion requise';
  end if;

  select captain_id into v_captain from public.nvg_tournament_teams where id = p_team;
  if not found then
    raise exception 'équipe introuvable';
  end if;

  if exists (
    select 1 from public.nvg_tournament_registrations
    where team_id = p_team and status <> 'cancelled'
  ) then
    raise exception 'annule d''abord l''inscription au tournoi';
  end if;

  if v_captain = v_uid then
    delete from public.nvg_tournament_teams where id = p_team;
    return;
  end if;

  delete from public.nvg_tournament_team_members
  where team_id = p_team and user_id = v_uid;
  if not found then
    raise exception 'tu ne fais pas partie de cette équipe';
  end if;
end;
$$;

revoke all on function public.nvg_tournament_leave_team(uuid) from public;
grant execute on function public.nvg_tournament_leave_team(uuid) to authenticated;

create or replace function public.nvg_tournament_register_solo(
  p_tournament uuid,
  p_platform text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_t record;
  v_reg uuid;
  v_count int;
begin
  if v_uid is null then
    raise exception 'connexion requise';
  end if;

  select * into v_t from public.nvg_tournaments where id = p_tournament and published;
  if not found then
    raise exception 'tournoi introuvable';
  end if;
  if v_t.mode <> 'solo' then
    raise exception 'ce tournoi se joue en équipe';
  end if;
  if v_t.status <> 'open' then
    raise exception 'les inscriptions sont fermées';
  end if;
  if v_t.registration_closes_at is not null and now() > v_t.registration_closes_at then
    raise exception 'les inscriptions sont fermées';
  end if;
  if exists (
    select 1 from public.nvg_tournament_registrations
    where tournament_id = p_tournament and user_id = v_uid and status <> 'cancelled'
  ) then
    raise exception 'tu es déjà inscrit à ce tournoi';
  end if;

  if v_t.max_participants is not null then
    select count(*) into v_count
    from public.nvg_tournament_registrations
    where tournament_id = p_tournament and status <> 'cancelled';
    if v_count >= v_t.max_participants then
      raise exception 'tournoi complet';
    end if;
  end if;

  insert into public.nvg_tournament_registrations (tournament_id, user_id, team_id, status, platform_id)
  values (p_tournament, v_uid, null, 'pending', nullif(trim(p_platform), ''))
  returning id into v_reg;

  return v_reg;
end;
$$;

revoke all on function public.nvg_tournament_register_solo(uuid, text) from public;
grant execute on function public.nvg_tournament_register_solo(uuid, text) to authenticated;

create or replace function public.nvg_tournament_register_team(
  p_team uuid,
  p_platform text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_team record;
  v_t record;
  v_reg uuid;
  v_count int;
begin
  if v_uid is null then
    raise exception 'connexion requise';
  end if;

  select * into v_team from public.nvg_tournament_teams where id = p_team;
  if not found then
    raise exception 'équipe introuvable';
  end if;
  if v_team.captain_id <> v_uid then
    raise exception 'seul le capitaine inscrit l''équipe';
  end if;

  select * into v_t from public.nvg_tournaments where id = v_team.tournament_id and published;
  if not found then
    raise exception 'tournoi introuvable';
  end if;
  if v_t.mode <> 'team' then
    raise exception 'ce tournoi se joue en solo';
  end if;
  if v_t.status <> 'open' then
    raise exception 'les inscriptions sont fermées';
  end if;
  if v_t.registration_closes_at is not null and now() > v_t.registration_closes_at then
    raise exception 'les inscriptions sont fermées';
  end if;
  if exists (
    select 1 from public.nvg_tournament_registrations
    where tournament_id = v_t.id and team_id = p_team and status <> 'cancelled'
  ) then
    raise exception 'cette équipe est déjà inscrite';
  end if;

  select count(*) into v_count
  from public.nvg_tournament_team_members
  where team_id = p_team;
  if v_count < v_t.team_min then
    raise exception 'équipe incomplète : % joueur(s) minimum', v_t.team_min;
  end if;
  if v_count > v_t.team_max then
    raise exception 'équipe trop grande : % joueur(s) maximum', v_t.team_max;
  end if;

  if v_t.max_participants is not null then
    select count(*) into v_count
    from public.nvg_tournament_registrations
    where tournament_id = v_t.id and status <> 'cancelled';
    if v_count >= v_t.max_participants then
      raise exception 'tournoi complet';
    end if;
  end if;

  insert into public.nvg_tournament_registrations (tournament_id, user_id, team_id, status, platform_id)
  values (v_t.id, v_uid, p_team, 'pending', nullif(trim(p_platform), ''))
  returning id into v_reg;

  return v_reg;
end;
$$;

revoke all on function public.nvg_tournament_register_team(uuid, text) from public;
grant execute on function public.nvg_tournament_register_team(uuid, text) to authenticated;

create or replace function public.nvg_tournament_cancel(p_registration uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_reg record;
begin
  if v_uid is null then
    raise exception 'connexion requise';
  end if;

  select * into v_reg from public.nvg_tournament_registrations where id = p_registration;
  if not found then
    raise exception 'inscription introuvable';
  end if;
  if v_reg.user_id <> v_uid
     and (v_reg.team_id is null or not public.nvg_tournament_is_team_member(v_reg.team_id))
     and not public.nvg_is_admin() then
    raise exception 'non autorisé';
  end if;

  update public.nvg_tournament_registrations
  set status = 'cancelled', updated_at = now()
  where id = p_registration;
end;
$$;

revoke all on function public.nvg_tournament_cancel(uuid) from public;
grant execute on function public.nvg_tournament_cancel(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Vues publiques (sans code d'invitation)
-- ---------------------------------------------------------------------------

create or replace view public.nvg_tournament_teams_public as
select
  t.id,
  t.tournament_id,
  t.name,
  t.tag,
  count(m.user_id)::int as member_count,
  t.created_at
from public.nvg_tournament_teams t
join public.nvg_tournaments tr on tr.id = t.tournament_id and tr.published
left join public.nvg_tournament_team_members m on m.team_id = t.id
group by t.id;

grant select on public.nvg_tournament_teams_public to anon, authenticated;

create or replace view public.nvg_tournament_registrations_public as
select
  r.id,
  r.tournament_id,
  r.status,
  r.created_at,
  coalesce(t.name, u.name, 'Joueur') as display_name,
  t.tag as team_tag,
  (t.id is not null) as is_team
from public.nvg_tournament_registrations r
join public.nvg_tournaments tr on tr.id = r.tournament_id and tr.published
left join public.nvg_tournament_teams t on t.id = r.team_id
left join public.nvg_users u on u.id = r.user_id
where r.status in ('pending', 'confirmed');

grant select on public.nvg_tournament_registrations_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Visuels des jeux (bucket public games-img)
-- Fichiers : <slug-du-jeu>-logo.png et <slug-du-jeu>-banner.png.
-- Lecture publique, écriture réservée aux admins NVG.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('games-img', 'games-img', true, 4194304, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 4194304,
      allowed_mime_types = array['image/png','image/jpeg','image/webp'];

drop policy if exists "games-img lecture" on storage.objects;
create policy "games-img lecture" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'games-img');

drop policy if exists "games-img upload admin" on storage.objects;
create policy "games-img upload admin" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'games-img' and public.nvg_is_admin());

drop policy if exists "games-img modif admin" on storage.objects;
create policy "games-img modif admin" on storage.objects
  for update to authenticated
  using (bucket_id = 'games-img' and public.nvg_is_admin())
  with check (bucket_id = 'games-img' and public.nvg_is_admin());

drop policy if exists "games-img suppression admin" on storage.objects;
create policy "games-img suppression admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'games-img' and public.nvg_is_admin());
