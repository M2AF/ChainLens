-- Usernames are optional, canonical lowercase identities. UUIDs never change.
alter table public.cl_users add column username text;
alter table public.cl_users add constraint cl_users_username_format
  check (username is null or username ~ '^[a-z0-9_]{3,24}$');
create unique index cl_users_username_unique on public.cl_users (lower(username)) where username is not null;
-- Existing RLS, browser-role revocations and service-role access remain intact.
