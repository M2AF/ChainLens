-- Approved and applied 2026-10-12 to the configured Supabase project.
-- ChainLens Express and Magic Money Worker both use service-role access.
begin;
alter table public.cl_users enable row level security;
alter table public.cl_wallets enable row level security;
alter table public.cl_linked_accounts enable row level security;
revoke all on public.cl_users, public.cl_wallets, public.cl_linked_accounts from anon, authenticated;
grant select, insert, update, delete on public.cl_users, public.cl_wallets, public.cl_linked_accounts to service_role;
commit;
