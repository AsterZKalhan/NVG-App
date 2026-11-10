-- Gestionnaires du bot Discord par serveur.
-- Remplie par la fonction Edge discord-oauth à chaque connexion Discord.
-- Un membre NVG ne peut configurer que les serveurs listés ici pour lui.
-- Aucune lecture publique : la fonction discord-bot passe par la clé de service.

create table if not exists public.nvg_discord_managers (
  user_id uuid not null references auth.users(id) on delete cascade,
  guild_id text not null,
  guild_name text,
  guild_icon text,
  updated_at timestamptz not null default now(),
  primary key (user_id, guild_id)
);

create index if not exists nvg_discord_managers_guild_idx
  on public.nvg_discord_managers (guild_id);

alter table public.nvg_discord_managers enable row level security;

revoke all on public.nvg_discord_managers from anon, authenticated;
