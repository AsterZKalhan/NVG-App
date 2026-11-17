-- Tournoi des 9 Mondes — retour de paiement des billets.
--
-- Le lien de billetterie reçoit un paramètre nvg_ref :
--   player:<tournoi>:<joueur>  → billet d'un joueur
--   team:<équipe>              → pass équipe : tous les joueurs de l'équipe encore à régler
-- Quand la billetterie confirme le paiement, elle (ou un relais) appelle
--   POST /rest/v1/rpc/nvg_tournament_payment_return
--   { "p_secret": "<secret>", "p_ref": "<nvg_ref>" }
-- Le secret est stocké dans nvg_payment_config (clé return_secret). Il se lit dans
-- le SQL Editor : select value from public.nvg_payment_config where key = 'return_secret';

create table if not exists public.nvg_payment_config (
  key text primary key,
  value text not null
);

alter table public.nvg_payment_config enable row level security;
-- Aucune policy : la table n'est lisible que par l'éditeur SQL et les fonctions SECURITY DEFINER.

insert into public.nvg_payment_config (key, value)
values ('return_secret', md5(random()::text || clock_timestamp()::text) || md5(random()::text || clock_timestamp()::text))
on conflict (key) do nothing;

create or replace function public.nvg_tournament_payment_return(p_secret text, p_ref text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_expected text;
  v_kind text := split_part(p_ref, ':', 1);
  v_tournament uuid;
  v_user text;
  v_team uuid;
  v_players int := 0;
  v_regs int := 0;
begin
  select value into v_expected from public.nvg_payment_config where key = 'return_secret';
  if v_expected is null or p_secret is distinct from v_expected then
    raise exception 'secret invalide';
  end if;

  if v_kind = 'player' then
    v_tournament := split_part(p_ref, ':', 2)::uuid;
    v_user := split_part(p_ref, ':', 3);
    update public.nvg_tournament_players
    set payment_status = 'paid', paid_at = now()
    where tournament_id = v_tournament and user_id = v_user and payment_status = 'awaiting';
    get diagnostics v_players = row_count;
    update public.nvg_tournament_registrations
    set payment_status = 'paid', paid_at = now()
    where tournament_id = v_tournament and user_id = v_user and payment_status = 'awaiting';
    get diagnostics v_regs = row_count;

  elsif v_kind = 'team' then
    v_team := split_part(p_ref, ':', 2)::uuid;
    update public.nvg_tournament_players p
    set payment_status = 'paid', paid_at = now()
    from public.nvg_tournament_team_members m
    join public.nvg_tournament_teams t on t.id = m.team_id
    where m.team_id = v_team
      and p.user_id = m.user_id
      and p.tournament_id = t.tournament_id
      and p.payment_status = 'awaiting';
    get diagnostics v_players = row_count;
    update public.nvg_tournament_registrations
    set payment_status = 'paid', paid_at = now()
    where team_id = v_team and payment_status = 'awaiting';
    get diagnostics v_regs = row_count;

  else
    raise exception 'référence inconnue';
  end if;

  return jsonb_build_object('players_paid', v_players, 'registrations_paid', v_regs);
end;
$$;

revoke all on function public.nvg_tournament_payment_return(text, text) from public;
grant execute on function public.nvg_tournament_payment_return(text, text) to anon, authenticated;
