-- Apply in Supabase SQL editor before deploying the chat presence feature.
-- The backend uses ChainLens JWTs and a service-role client. No browser grants.
create table if not exists public.cl_chat_presence (
  user_id uuid not null references public.cl_users(id) on delete cascade,
  session_id uuid not null,
  in_world boolean not null default false,
  expires_at timestamptz not null,
  primary key (user_id, session_id)
);
create index if not exists cl_chat_presence_expiry_idx on public.cl_chat_presence(expires_at);
alter table public.cl_chat_presence enable row level security;
revoke all on public.cl_chat_presence from anon, authenticated;
grant select, insert, update, delete on public.cl_chat_presence to service_role;

-- Expired rows never count as online. Optional periodic housekeeping:
-- delete from public.cl_chat_presence where expires_at < now() - interval '1 day';
