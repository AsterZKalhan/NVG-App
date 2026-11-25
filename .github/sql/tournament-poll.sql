-- Sondages du Tournoi des 9 Mondes.
-- Deux types, choisis à la création :
--   nine_worlds : 9 jeux, quels qu'ils soient
--   decathlon   : 3 colonnes (5v5, 2v2, 1v1), 3 jeux par colonne
-- Le vote passe par nvg_poll_cast. Le classement public (sans e-mails)
-- passe par nvg_poll_ranking. À exécuter dans l'éditeur SQL Supabase.

create table if not exists public.nvg_polls (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 120),
  intro text not null default '' check (char_length(intro) <= 500),
  mode text not null default 'nine_worlds' check (mode in ('nine_worlds', 'decathlon')),
  open boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.nvg_poll_games (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid references public.nvg_polls(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  link text check (link is null or (link ~* '^https://' and char_length(link) <= 500)),
  image_url text check (image_url is null or (image_url ~* '^https://' and char_length(image_url) <= 500)),
  column_key text,
  position integer not null default 0,
  price_cents integer not null default 0 check (price_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.nvg_polls drop column if exists price_cents;

alter table public.nvg_poll_games add column if not exists price_cents integer not null default 0;
alter table public.nvg_poll_games add column if not exists poll_id uuid references public.nvg_polls(id) on delete cascade;
alter table public.nvg_poll_games add column if not exists column_key text;

create table if not exists public.nvg_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid references public.nvg_polls(id) on delete cascade,
  email text not null check (char_length(email) <= 200),
  created_at timestamptz not null default now()
);

alter table public.nvg_poll_votes add column if not exists poll_id uuid references public.nvg_polls(id) on delete cascade;

create table if not exists public.nvg_poll_choices (
  vote_id uuid not null references public.nvg_poll_votes(id) on delete cascade,
  game_id uuid not null references public.nvg_poll_games(id) on delete restrict,
  primary key (vote_id, game_id)
);

-- Ancien sondage unique : on le reprend comme un sondage « 9 Mondes ».
do $$
declare
  v_poll uuid;
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'nvg_poll_settings'
  ) and not exists (select 1 from public.nvg_polls) then
    insert into public.nvg_polls (title, intro, open, mode)
    select coalesce(nullif(trim(title), ''), 'Choisis tes 9 jeux'),
           coalesce(intro, ''),
           coalesce(open, false),
           'nine_worlds'
    from public.nvg_poll_settings
    where id = 1
    returning id into v_poll;
  end if;

  select id into v_poll from public.nvg_polls order by created_at limit 1;

  if v_poll is not null then
    update public.nvg_poll_games set poll_id = v_poll where poll_id is null;
    update public.nvg_poll_votes set poll_id = v_poll where poll_id is null;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from public.nvg_poll_games where poll_id is null) then
    alter table public.nvg_poll_games alter column poll_id set not null;
  end if;
  if not exists (select 1 from public.nvg_poll_votes where poll_id is null) then
    alter table public.nvg_poll_votes alter column poll_id set not null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nvg_poll_games_column_chk') then
    alter table public.nvg_poll_games
      add constraint nvg_poll_games_column_chk
      check (column_key is null or column_key in ('5v5', '2v2', '1v1'));
  end if;
end $$;

drop index if exists public.nvg_poll_votes_email_idx;
create unique index if not exists nvg_poll_votes_poll_email_idx
  on public.nvg_poll_votes (poll_id, email);
create index if not exists nvg_poll_games_poll_idx on public.nvg_poll_games (poll_id, position);
create index if not exists nvg_poll_choices_game_idx on public.nvg_poll_choices (game_id);

drop table if exists public.nvg_poll_settings;

alter table public.nvg_polls enable row level security;
alter table public.nvg_poll_games enable row level security;
alter table public.nvg_poll_votes enable row level security;
alter table public.nvg_poll_choices enable row level security;

grant select on public.nvg_polls, public.nvg_poll_games to anon, authenticated;
grant insert, update, delete on public.nvg_polls to authenticated;
grant insert, update, delete on public.nvg_poll_games to authenticated;
grant select, delete on public.nvg_poll_votes to authenticated;
grant select on public.nvg_poll_choices to authenticated;

drop policy if exists "sondage lecture" on public.nvg_polls;
create policy "sondage lecture"
  on public.nvg_polls for select
  using (true);

drop policy if exists "sondage admin" on public.nvg_polls;
create policy "sondage admin"
  on public.nvg_polls for all
  to authenticated
  using (public.nvg_is_admin())
  with check (public.nvg_is_admin());

drop policy if exists "sondage jeux lecture" on public.nvg_poll_games;
create policy "sondage jeux lecture"
  on public.nvg_poll_games for select
  using (active or public.nvg_is_admin());

drop policy if exists "sondage jeux admin" on public.nvg_poll_games;
create policy "sondage jeux admin"
  on public.nvg_poll_games for all
  to authenticated
  using (public.nvg_is_admin())
  with check (public.nvg_is_admin());

drop policy if exists "sondage votes admin lecture" on public.nvg_poll_votes;
create policy "sondage votes admin lecture"
  on public.nvg_poll_votes for select
  to authenticated
  using (public.nvg_is_admin());

drop policy if exists "sondage votes admin suppression" on public.nvg_poll_votes;
create policy "sondage votes admin suppression"
  on public.nvg_poll_votes for delete
  to authenticated
  using (public.nvg_is_admin());

drop policy if exists "sondage choix admin lecture" on public.nvg_poll_choices;
create policy "sondage choix admin lecture"
  on public.nvg_poll_choices for select
  to authenticated
  using (public.nvg_is_admin());

create or replace function public.nvg_poll_cast(p_poll uuid, p_email text, p_games uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll public.nvg_polls%rowtype;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_vote uuid;
  v_count integer;
begin
  select * into v_poll from public.nvg_polls where id = p_poll;
  if not found or not v_poll.open then
    raise exception 'poll_closed';
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid_email';
  end if;

  if p_games is null
     or (select count(*) from unnest(p_games) as g) is distinct from (select count(distinct g) from unnest(p_games) as g) then
    raise exception 'need_nine';
  end if;

    if v_poll.mode = 'decathlon' then
    if (select count(distinct g) from unnest(p_games) as g) is distinct from 9 then
      raise exception 'need_three';
    end if;
    select count(*) into v_count
    from public.nvg_poll_games
    where poll_id = p_poll and active and column_key = '5v5' and id = any (p_games);
    if v_count is distinct from 3 then
      raise exception 'need_three';
    end if;
    select count(*) into v_count
    from public.nvg_poll_games
    where poll_id = p_poll and active and column_key = '2v2' and id = any (p_games);
    if v_count is distinct from 3 then
      raise exception 'need_three';
    end if;
    select count(*) into v_count
    from public.nvg_poll_games
    where poll_id = p_poll and active and column_key = '1v1' and id = any (p_games);
    if v_count is distinct from 3 then
      raise exception 'need_three';
    end if;
  else
    if (select count(distinct g) from unnest(p_games) as g) is distinct from 9 then
      raise exception 'need_nine';
    end if;
    select count(*) into v_count
    from public.nvg_poll_games
    where poll_id = p_poll
      and active
      and id = any (p_games);
    if v_count is distinct from 9 then
      raise exception 'invalid_games';
    end if;
  end if;

  insert into public.nvg_poll_votes (poll_id, email)
  values (p_poll, v_email)
  returning id into v_vote;

  insert into public.nvg_poll_choices (vote_id, game_id)
  select v_vote, g
  from unnest(p_games) as g;
exception
  when unique_violation then
    raise exception 'already_voted';
end;
$$;

drop function if exists public.nvg_poll_cast(text, uuid[]);
revoke all on function public.nvg_poll_cast(uuid, text, uuid[]) from public;
grant execute on function public.nvg_poll_cast(uuid, text, uuid[]) to anon, authenticated;

create or replace function public.nvg_poll_ranking(p_poll uuid)
returns table (
  id uuid,
  title text,
  link text,
  image_url text,
  column_key text,
  votes integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.title,
    g.link,
    g.image_url,
    g.column_key,
    count(c.vote_id)::integer as votes
  from public.nvg_poll_games g
  left join public.nvg_poll_choices c on c.game_id = g.id
  where g.poll_id = p_poll
    and g.active
  group by g.id
  order by votes desc, g.position, g.title;
$$;

drop function if exists public.nvg_poll_ranking();
revoke all on function public.nvg_poll_ranking(uuid) from public;
grant execute on function public.nvg_poll_ranking(uuid) to anon, authenticated;
