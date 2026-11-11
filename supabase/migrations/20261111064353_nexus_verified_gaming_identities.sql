-- Verified gaming identities, never OAuth tokens. Accessible only to backend service_role.
begin;
create table public.cl_nexus_identities (
 user_id uuid not null references public.cl_users(id) on delete cascade,
 provider text not null check (provider in ('steam','discord','xbox','epic')),
 provider_id text not null check (length(provider_id) between 12 and 32),
 verified_at timestamptz not null default now(),
 primary key(provider,provider_id),
 unique(user_id,provider),
 constraint valid_nexus_provider_id check (
  (provider='steam' and provider_id ~ '^7656119[0-9]{10}$') or
  (provider='discord' and provider_id ~ '^[0-9]{16,22}$') or
  (provider='xbox' and provider_id ~ '^[0-9]{12,20}$') or
  (provider='epic' and provider_id ~ '^[a-f0-9]{32}$')
 )
);
alter table public.cl_nexus_identities enable row level security;
revoke all on public.cl_nexus_identities from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.cl_nexus_identities to service_role;

create function public.link_nexus_identity(owner_id uuid,platform text,external_id text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
 -- Do not take an existing ChainLens login away from another account.
 if exists(select 1 from public.cl_users where provider=platform and provider_id=external_id and id<>owner_id)
 or exists(select 1 from public.cl_linked_accounts where provider=platform and provider_id=external_id and user_id<>owner_id)
 then raise exception 'identity_conflict' using errcode='23505'; end if;
 insert into public.cl_nexus_identities as existing(user_id,provider,provider_id)
 values(owner_id,platform,external_id)
 on conflict(provider,provider_id) do update set verified_at=now()
 where existing.user_id=excluded.user_id;
 if not found then raise exception 'identity_conflict' using errcode='23505'; end if;
end;
$$;
revoke all on function public.link_nexus_identity(uuid,text,text) from public,anon,authenticated;
grant execute on function public.link_nexus_identity(uuid,text,text) to service_role;
commit;
