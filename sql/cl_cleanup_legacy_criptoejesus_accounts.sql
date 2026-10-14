-- APPLIED 2026-10-13 after explicit user approval. Historical audit script.
-- Not a repeatable migration: rerunning refuses because the legacy rows are absent.
-- Project vxrhosrktbknogyeyewy. Current account ec18dcf5 is never modified.
-- Refuses cleanup if a candidate gains data or its login is no longer linked to current.
begin;
do $cleanup$
declare
  current_id constant uuid := 'ec18dcf5-3271-46fd-8029-41e5b2f39eed';
  old_ids constant uuid[] := array['a32b355b-3ca2-497a-9f3d-6657cd7faedf'::uuid,'f8c86cbe-4199-44ab-bb07-2e2fee2341e5'::uuid];
  candidate record;
  reference record;
  referenced_rows bigint;
  removed_rows integer;
begin
  perform 1 from public.cl_users where id=current_id for update;
  if not found then raise exception 'Current account is missing'; end if;
  perform 1 from public.cl_users where id=any(old_ids) for update;
  if (select count(*) from public.cl_users where id=any(old_ids))<>2 then
    raise exception 'Expected exactly two legacy accounts';
  end if;
  for candidate in select id,provider,provider_id from public.cl_users where id=any(old_ids) loop
    if candidate.provider not in ('google','discord') or not exists (
      select 1 from public.cl_linked_accounts la where la.user_id=current_id
      and la.provider=candidate.provider and la.provider_id=candidate.provider_id
    ) then raise exception 'Legacy login is not linked to the current account'; end if;
    -- Discover every referencing FK, including relationships added in the future.
    for reference in
      select tc.table_schema,tc.table_name,kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name=kcu.constraint_name and tc.constraint_schema=kcu.constraint_schema
      join information_schema.referential_constraints rc
        on rc.constraint_name=tc.constraint_name and rc.constraint_schema=tc.constraint_schema
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name=rc.unique_constraint_name and ccu.constraint_schema=rc.unique_constraint_schema
      where tc.constraint_type='FOREIGN KEY' and ccu.table_schema='public' and ccu.table_name='cl_users'
    loop
      execute format('select count(*) from %I.%I where %I=$1',reference.table_schema,reference.table_name,reference.column_name)
        into referenced_rows using candidate.id;
      if referenced_rows<>0 then
        raise exception 'Legacy account % has data in %.%; cleanup refused',candidate.id,reference.table_schema,reference.table_name;
      end if;
    end loop;
  end loop;
  delete from public.cl_users where id=any(old_ids) and id<>current_id;
  get diagnostics removed_rows=row_count;
  if removed_rows<>2 then raise exception 'Unexpected removal count'; end if;
end
$cleanup$;
commit;
