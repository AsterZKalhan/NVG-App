-- Tournoi des 9 Mondes — le tarif s'applique aussi aux inscriptions.
--
-- tournament-fee-sync.sql ne mettait à jour que nvg_tournament_players : une
-- inscription créée à 0 € gardait « Inscription gratuite » après passage à un
-- tarif payant. Cette version met aussi à jour nvg_tournament_registrations.
-- Les inscriptions déjà payées ou remboursées gardent leur état.

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

    update public.nvg_tournament_registrations
    set payment_status = case when coalesce(new.entry_fee_cents, 0) > 0 then 'awaiting' else 'not_required' end
    where tournament_id = new.id
      and payment_status in ('awaiting', 'not_required');
  end if;
  return new;
end;
$$;

-- État correct pour les inscriptions existantes.
update public.nvg_tournament_registrations r
set payment_status = case when coalesce(t.entry_fee_cents, 0) > 0 then 'awaiting' else 'not_required' end
from public.nvg_tournaments t
where t.id = r.tournament_id
  and r.payment_status in ('awaiting', 'not_required');
