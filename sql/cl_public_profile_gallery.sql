-- Public profile preferences and backend-only social/artwork records.
alter table public.cl_users add column if not exists public_wallets boolean not null default true;
alter table public.cl_users add column if not exists public_favorites boolean not null default true;
create table if not exists public.cl_favorite_artwork (
  user_id uuid not null references public.cl_users(id) on delete cascade,
  key text not null check (length(key) <= 256),
  asset jsonb not null,
  updated_at timestamptz not null default now(),
  primary key(user_id,key)
);
create table if not exists public.cl_user_blocks (
  blocker_id uuid not null references public.cl_users(id) on delete cascade,
  blocked_id uuid not null references public.cl_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id,blocked_id),
  check(blocker_id <> blocked_id)
);
create index if not exists cl_user_blocks_blocked_idx on public.cl_user_blocks(blocked_id);
create table if not exists public.cl_profile_reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references public.cl_users(id) on delete cascade,
  target_id uuid not null references public.cl_users(id) on delete cascade,
  reason text not null check(reason in ('spam','harassment','impersonation','other')),
  details text not null default '' check(length(details) <= 1000),
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  check(reporter_id <> target_id)
);
create index if not exists cl_profile_reports_target_idx on public.cl_profile_reports(target_id,created_at desc);
create index if not exists cl_profile_reports_reporter_idx on public.cl_profile_reports(reporter_id,created_at desc);
alter table public.cl_favorite_artwork enable row level security;
alter table public.cl_user_blocks enable row level security;
alter table public.cl_profile_reports enable row level security;
revoke all on public.cl_favorite_artwork, public.cl_user_blocks, public.cl_profile_reports from anon,authenticated;
grant select,insert,update,delete on public.cl_favorite_artwork, public.cl_user_blocks, public.cl_profile_reports to service_role;
grant usage,select on sequence public.cl_profile_reports_id_seq to service_role;
