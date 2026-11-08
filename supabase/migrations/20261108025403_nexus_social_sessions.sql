-- The Nexus uses an opaque, revocable social-only credential. Only its hash is stored.
create table if not exists public.cl_nexus_sessions (
 token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
 user_id uuid not null references public.cl_users(id) on delete cascade,
 client_id text not null check (client_id = 'nexus-desktop'),
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 constraint cl_nexus_sessions_expiry check (expires_at > created_at)
);
create index if not exists cl_nexus_sessions_expiry_idx on public.cl_nexus_sessions(expires_at);
alter table public.cl_nexus_sessions enable row level security;
revoke all on public.cl_nexus_sessions from public, anon, authenticated;
grant select, insert, delete on public.cl_nexus_sessions to service_role;
