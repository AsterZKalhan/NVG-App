-- Images des annonces manuelles du bot Discord.
-- Les gestionnaires d'un serveur (table nvg_discord_managers) peuvent déposer
-- une image dans notifs/discord/<guild_id>/. Le bucket notifs est public en
-- lecture, donc l'URL publique est directement utilisable par Discord.
-- Les admins NVG gardent leur droit d'upload existant.
-- Aucun update ni delete : chaque image reçoit un nom unique, pas d'upsert.

-- La table nvg_discord_managers est révoquée pour authenticated : la policy
-- ne peut pas la lire directement. On passe par une fonction SECURITY DEFINER.
create or replace function public.nvg_manages_guild(p_guild_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.nvg_discord_managers
    where user_id = auth.uid()
      and guild_id = p_guild_id
  );
$$;

revoke all on function public.nvg_manages_guild(text) from public;
grant execute on function public.nvg_manages_guild(text) to authenticated;

drop policy if exists "notifs upload annonces discord" on storage.objects;

create policy "notifs upload annonces discord"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'notifs'
  and (storage.foldername(name))[1] = 'discord'
  and (
    public.nvg_is_admin()
    or public.nvg_manages_guild(split_part(name, '/', 2))
  )
);

-- Lecture du dossier d'annonces (le bucket est déjà public, mais la policy
-- évite les erreurs de type RETURNING / listing côté API Storage).
drop policy if exists "notifs lecture annonces discord" on storage.objects;

create policy "notifs lecture annonces discord"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'notifs'
  and (storage.foldername(name))[1] = 'discord'
);
