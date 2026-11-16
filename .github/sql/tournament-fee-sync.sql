-- Tournoi des 9 Mondes — synchronisation du tarif avec les joueurs.
--
-- Quand le tarif d'un tournoi change, les joueurs qui n'ont pas encore payé
-- passent en « billet à prendre » (tarif > 0) ou « gratuit » (tarif = 0).
-- Les joueurs déjà payés ou remboursés gardent leur état.

create or replace function public.nvg_sync_player_payment_fee()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.entry_fee_cents is distinct from old.entry_fee_cents then
    update public.nvg_tournament_players
    set payment_status = case when coalesce(new.entry_fee_cents, 0) > 0 then 'awaiting' else 'not_required' end
    where tournament_id = new.id
      and payment_status in ('awaiting', 'not_required');
  end if;
  return new;
end;
$$;

drop trigger if exists nvg_tournament_fee_sync on public.nvg_tournaments;
create trigger nvg_tournament_fee_sync
  after update of entry_fee_cents on public.nvg_tournaments
  for each row execute function public.nvg_sync_player_payment_fee();

-- État correct pour les tournois existants.
update public.nvg_tournament_players p
set payment_status = case when coalesce(t.entry_fee_cents, 0) > 0 then 'awaiting' else 'not_required' end
from public.nvg_tournaments t
where t.id = p.tournament_id
  and p.payment_status in ('awaiting', 'not_required');
