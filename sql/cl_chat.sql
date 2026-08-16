-- ===========================================================================
-- ChainLens Messenger: friendships, World Chat, and direct messages
--
-- Run once in the Supabase SQL editor. Safe to re-run. The Express backend is
-- the only caller: ChainLens uses its own JWTs, while Supabase is reached with
-- SUPABASE_SERVICE_KEY. RLS therefore has no client policies by design.
-- ===========================================================================

create table if not exists public.cl_friendships (
  id           bigint generated always as identity primary key,
  user_low     uuid not null references public.cl_users(id) on delete cascade,
  user_high    uuid not null references public.cl_users(id) on delete cascade,
  requested_by uuid not null references public.cl_users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  accepted_at  timestamptz,

  constraint cl_friendships_distinct_users check (user_low < user_high),
  constraint cl_friendships_requester_is_member check (requested_by in (user_low, user_high)),
  constraint cl_friendships_pair_unique unique (user_low, user_high)
);

-- The unique pair index covers user_low; the reverse lookup needs its own index.
create index if not exists cl_friendships_user_high_idx
  on public.cl_friendships(user_high, status, updated_at desc);
create index if not exists cl_friendships_requested_by_idx
  on public.cl_friendships(requested_by);

create table if not exists public.cl_world_messages (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.cl_users(id) on delete cascade,
  message_type text not null default 'text' check (message_type in ('text', 'gif')),
  content      text not null,
  created_at   timestamptz not null default now(),

  constraint cl_world_messages_content_check check (
    (message_type = 'text' and char_length(content) between 1 and 500)
    or (message_type = 'gif' and char_length(content) between 1 and 2048)
  )
);

create index if not exists cl_world_messages_user_id_idx
  on public.cl_world_messages(user_id);

create table if not exists public.cl_direct_messages (
  id            bigint generated always as identity primary key,
  friendship_id bigint not null references public.cl_friendships(id) on delete cascade,
  sender_id     uuid not null references public.cl_users(id) on delete cascade,
  message_type  text not null default 'text' check (message_type in ('text', 'gif')),
  content       text not null,
  created_at    timestamptz not null default now(),

  constraint cl_direct_messages_content_check check (
    (message_type = 'text' and char_length(content) between 1 and 500)
    or (message_type = 'gif' and char_length(content) between 1 and 2048)
  )
);

-- Cursor reads are always scoped to one accepted friendship.
create index if not exists cl_direct_messages_friendship_id_idx
  on public.cl_direct_messages(friendship_id, id desc);
create index if not exists cl_direct_messages_sender_id_idx
  on public.cl_direct_messages(sender_id);

alter table public.cl_friendships enable row level security;
alter table public.cl_world_messages enable row level security;
alter table public.cl_direct_messages enable row level security;

-- Current Supabase projects make Data API exposure opt-in. Keep the intent
-- explicit on old and new projects: browser roles cannot touch chat rows.
revoke all on table public.cl_friendships, public.cl_world_messages, public.cl_direct_messages
  from anon, authenticated;
grant select, insert, update, delete
  on table public.cl_friendships, public.cl_world_messages, public.cl_direct_messages
  to service_role;
grant usage, select
  on sequence public.cl_friendships_id_seq, public.cl_world_messages_id_seq, public.cl_direct_messages_id_seq
  to service_role;
