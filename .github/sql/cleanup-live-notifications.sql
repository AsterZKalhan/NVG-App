-- Suppression automatique des notifications « NVG est en live ! » après 48 h.
-- Les autres notifications ne sont jamais touchées.

create or replace function public.nvg_cleanup_live_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  with old_live as (
    select id
    from public.nvg_notifications
    where title = 'NVG est en live !'
      -- La colonne time est un texte ISO (ex. 2026-11-02T05:00:00.000Z).
      and time ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
      and time::timestamptz < now() - interval '48 hours'
  ), cleaned_reads as (
    delete from public.nvg_notification_reads
    where notification_id in (select id from old_live)
    returning 1
  ), deleted as (
    delete from public.nvg_notifications
    where id in (select id from old_live)
    returning id
  )
  select count(*) into removed from deleted;

  return removed;
end;
$$;

revoke all on function public.nvg_cleanup_live_notifications() from public;
grant execute on function public.nvg_cleanup_live_notifications() to service_role;

-- Toutes les heures à la minute 17 (délai maximal : 48 h + 1 h).
do $do$
declare
  existing bigint;
begin
  select jobid into existing from cron.job where jobname = 'nvg-cleanup-live-notifications';
  if existing is not null then
    perform cron.unschedule(existing);
  end if;

  perform cron.schedule(
    'nvg-cleanup-live-notifications',
    '17 * * * *',
    $cmd$select public.nvg_cleanup_live_notifications();$cmd$
  );
end
$do$;
