-- Protection de nvg_games : seuls les admins peuvent modifier une proposition ou réinitialiser
-- les votes. Un membre connecté peut uniquement ajouter son propre vote, une seule fois.

create or replace function public.nvg_games_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.nvg_is_admin() then
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;

  -- Un membre ne peut pas modifier autre chose que votes et voters.
  if (to_jsonb(new) - 'votes' - 'voters') is distinct from (to_jsonb(old) - 'votes' - 'voters') then
    raise exception 'Seul un admin peut modifier cette proposition';
  end if;

  -- Un vote = un ajout à la fin de la liste, avec le propre identifiant du membre.
  if jsonb_array_length(coalesce(new.voters, '[]'::jsonb)) <> jsonb_array_length(coalesce(old.voters, '[]'::jsonb)) + 1 then
    raise exception 'Vote invalide';
  end if;
  if (new.voters -> (jsonb_array_length(new.voters) - 1) ->> 'id') is distinct from auth.uid()::text then
    raise exception 'Vote invalide';
  end if;
  if (new.voters - (jsonb_array_length(new.voters) - 1)) is distinct from coalesce(old.voters, '[]'::jsonb) then
    raise exception 'Vote invalide';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(old.voters, '[]'::jsonb)) e
    where e ->> 'id' = auth.uid()::text
  ) then
    raise exception 'Vous avez déjà voté pour ce jeu';
  end if;
  if new.votes is distinct from coalesce(old.votes, 0) + 1 then
    raise exception 'Vote invalide';
  end if;

  return new;
end;
$$;

revoke all on function public.nvg_games_guard() from public, anon, authenticated;

drop trigger if exists nvg_games_guard_trg on public.nvg_games;
create trigger nvg_games_guard_trg
  before update on public.nvg_games
  for each row execute function public.nvg_games_guard();
