begin;
create table if not exists public.cl_castle_sessions (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references public.cl_users(id) on delete cascade,
  client_id text not null default 'castle-siege-android' check (client_id = 'castle-siege-android'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > created_at and expires_at <= created_at + interval '8 days')
);
create index if not exists cl_castle_sessions_user_idx on public.cl_castle_sessions(user_id);
create index if not exists cl_castle_sessions_expiry_idx on public.cl_castle_sessions(expires_at);
alter table public.cl_castle_sessions enable row level security;
revoke all on public.cl_castle_sessions from public, anon, authenticated;
grant select, insert, delete on public.cl_castle_sessions to service_role;
comment on table public.cl_castle_sessions is 'Hashed opaque Castle Siege native sessions. Server only; never a ChainLens web JWT.';
notify pgrst, 'reload schema';
commit;
