-- Per-game world chats. Only the ChainLens backend may access this table.
create table if not exists public.cl_game_messages (
  id bigint generated always as identity primary key,
  game text not null check (game in ('duo','poker','pool','swarm','clash','world')),
  user_id uuid not null references public.cl_users(id) on delete cascade,
  message_type text not null check (message_type in ('text','gif')),
  content text not null check (char_length(content) between 1 and 2048),
  created_at timestamptz not null default now(),
  check (message_type <> 'text' or char_length(content) <= 500)
);
create index if not exists cl_game_messages_room_cursor on public.cl_game_messages(game,id desc);
create index if not exists cl_game_messages_user on public.cl_game_messages(user_id);
alter table public.cl_game_messages enable row level security;
revoke all on public.cl_game_messages from public, anon, authenticated;
grant all on public.cl_game_messages to service_role;
revoke all on sequence public.cl_game_messages_id_seq from public, anon, authenticated;
grant usage, select on sequence public.cl_game_messages_id_seq to service_role;
