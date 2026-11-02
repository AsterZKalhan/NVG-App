create table if not exists public.nvg_contact_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  first_name text not null,
  last_name text not null,
  pseudo text,
  email text not null,
  subject text not null,
  message text,
  twitch_channel text,
  instagram text,
  x_account text,
  discord text,
  youtube text,
  is_read boolean not null default false,
  read_at timestamptz,
  constraint nvg_contact_first_name_len check (char_length(first_name) between 1 and 80),
  constraint nvg_contact_last_name_len check (char_length(last_name) between 1 and 80),
  constraint nvg_contact_pseudo_len check (pseudo is null or char_length(pseudo) <= 60),
  constraint nvg_contact_email_len check (char_length(email) between 5 and 254),
  constraint nvg_contact_subject_len check (char_length(subject) between 1 and 60),
  constraint nvg_contact_message_len check (message is null or char_length(message) <= 50000),
  constraint nvg_contact_twitch_len check (twitch_channel is null or char_length(twitch_channel) <= 100),
  constraint nvg_contact_instagram_len check (instagram is null or char_length(instagram) <= 300),
  constraint nvg_contact_x_len check (x_account is null or char_length(x_account) <= 300),
  constraint nvg_contact_discord_len check (discord is null or char_length(discord) <= 300),
  constraint nvg_contact_youtube_len check (youtube is null or char_length(youtube) <= 300)
);

alter table public.nvg_contact_messages enable row level security;

drop policy if exists nvg_contact_admin_select on public.nvg_contact_messages;
create policy nvg_contact_admin_select on public.nvg_contact_messages
  for select to authenticated using (public.nvg_is_admin());

drop policy if exists nvg_contact_admin_update on public.nvg_contact_messages;
create policy nvg_contact_admin_update on public.nvg_contact_messages
  for update to authenticated using (public.nvg_is_admin()) with check (public.nvg_is_admin());

drop policy if exists nvg_contact_admin_delete on public.nvg_contact_messages;
create policy nvg_contact_admin_delete on public.nvg_contact_messages
  for delete to authenticated using (public.nvg_is_admin());

create index if not exists nvg_contact_created_idx on public.nvg_contact_messages (created_at desc);
create index if not exists nvg_contact_unread_idx on public.nvg_contact_messages (is_read) where is_read = false;
create index if not exists nvg_contact_email_idx on public.nvg_contact_messages (email, created_at desc);

alter table public.nvg_contact_messages replica identity full;
