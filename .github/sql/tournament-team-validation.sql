-- Tournoi des 9 Mondes — présence validée des équipes.
--
-- Une équipe inscrite reste « préinscrite » (inscription en attente) tant qu'aucun
-- de ses joueurs n'a réglé son billet. Dès qu'un joueur passe « Billet pris »,
-- l'inscription de l'équipe passe en « confirmée » : l'équipe est validée.
-- L'admin peut toujours confirmer une équipe à la main.
-- Une équipe préinscrite garde son slot dans le tournoi.

create or replace function public.nvg_validate_team_on_payment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
    update public.nvg_tournament_registrations r
    set status = 'confirmed'
    from public.nvg_tournament_teams t
    join public.nvg_tournament_team_members m on m.team_id = t.id
    where r.team_id = t.id
      and r.tournament_id = new.tournament_id
      and t.tournament_id = new.tournament_id
      and m.user_id = new.user_id
      and r.status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists nvg_player_paid_validates_team on public.nvg_tournament_players;
create trigger nvg_player_paid_validates_team
  after update of payment_status on public.nvg_tournament_players
  for each row execute function public.nvg_validate_team_on_payment();
