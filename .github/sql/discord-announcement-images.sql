-- Images des annonces manuelles du bot Discord.
-- Les gestionnaires d'un serveur (table nvg_discord_managers) peuvent déposer
-- une image dans notifs/discord/<guild_id>/. Le bucket notifs est public en
-- lecture, donc l'URL publique est directement utilisable par Discord.
-- Les admins NVG gardent leur droit d'upload existant.
-- Aucun update ni delete : chaque image reçoit un nom unique, pas d'upsert.

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
    or exists (
      select 1
      from public.nvg_discord_managers m
      where m.user_id = auth.uid()
        and m.guild_id = split_part(name, '/', 2)
    )
  )
);
