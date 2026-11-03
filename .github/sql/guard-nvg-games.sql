-- Protection de nvg_games : seuls les admins peuvent modifier une proposition ou réinitialiser
-- les votes. Un membre connecté peut uniquement ajouter son propre vote (une seule fois)
-- ou retirer son propre vote.

create or replace function public.nvg_games_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_len int := jsonb_array_length(coalesce(old.voters, '[]'::jsonb));
  new_len int := jsonb_array_length(coalesce(new.voters, '[]'::jsonb));
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

  -- Cas 1 : ajout de son propre vote, à la fin de la liste.
  if new_len = old_len + 1 then
    if (new.voters -> (new_len - 1) ->> 'id') is distinct from auth.uid()::text then
      raise exception 'Vote invalide';
    end if;
    if (new.voters - (new_len - 1)) is distinct from coalesce(old.voters, '[]'::jsonb) then
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
  end if;

  -- Cas 2 : retrait de son propre vote.
  if new_len = old_len - 1 then
    if not exists (
      select 1 from jsonb_array_elements(coalesce(old.voters, '[]'::jsonb)) e
      where e ->> 'id' = auth.uid()::text
    ) then
      raise exception 'Vous n''avez pas voté pour ce jeu';
    end if;
    if new.voters is distinct from (
      select coalesce(jsonb_agg(e order by ord), '[]'::jsonb)
      from jsonb_array_elements(coalesce(old.voters, '[]'::jsonb)) with ordinality as t(e, ord)
      where e ->> 'id' <> auth.uid()::text
    ) then
      raise exception 'Vote invalide';
    end if;
    if new.votes is distinct from coalesce(old.votes, 0) - 1 then
      raise exception 'Vote invalide';
    end if;
    return new;
  end if;

  raise exception 'Vote invalide';
end;
$$;

revoke all on function public.nvg_games_guard() from public, anon, authenticated;

drop trigger if exists nvg_games_guard_trg on public.nvg_games;
create trigger nvg_games_guard_trg
  before update on public.nvg_games
  for each row execute function public.nvg_games_guard();
