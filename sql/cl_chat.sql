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

-- ───────────────────────────────────────────────────────────────────────────
-- Read cursors
--
-- Unread state lives HERE, not on the device. ChainLens web, the desktop
-- wallet, the extension and mobile all authenticate as the same cl_users row,
-- so reading a DM on one has to clear its badge on the others — a localStorage
-- cursor cannot do that.
--
-- `conversation` is 'world' for World Chat and 'dm:<friendship_id>' for a
-- direct thread. A text key rather than a nullable friendship_id column: the
-- primary key stays simple, and NULL-in-a-unique-index has version-dependent
-- semantics we do not want to depend on.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.cl_chat_reads (
  user_id      uuid   not null references public.cl_users(id) on delete cascade,
  conversation text   not null,
  last_read_id bigint not null default 0,
  updated_at   timestamptz not null default now(),

  primary key (user_id, conversation),
  constraint cl_chat_reads_conversation_check check (
    conversation = 'world' or conversation ~ '^dm:[0-9]+$'
  ),
  constraint cl_chat_reads_cursor_check check (last_read_id >= 0)
);

-- The unread count filters a thread by "not mine, newer than the cursor". The
-- existing (friendship_id, id desc) index cannot serve the sender_id filter, and
-- without this the aggregate degrades to a heap scan per thread.
create index if not exists cl_direct_messages_unread_idx
  on public.cl_direct_messages(friendship_id, sender_id, id);

-- ───────────────────────────────────────────────────────────────────────────
-- Aggregate unread, in ONE round trip.
--
-- The badge polls this every 15-30s per signed-in client. Doing it as "list
-- friendships, then one count per thread" is an N+1 that grows with every
-- friend a user adds; as a single grouped join it is one query whose cost is
-- bounded by the unread rows themselves.
--
-- A thread with no cursor row counts from 0, which is correct: deleting a
-- friendship cascades its direct messages, so a friendship the user has never
-- read is also one that has no history to miss. Back-dating the FIRST cursor
-- for an existing account is the caller's job (see seedChatReads) — this
-- function deliberately has no opinion about it.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.cl_chat_unread(p_user_id uuid)
returns table (friendship_id bigint, friend_id uuid, unread bigint)
language sql
stable
security definer
set search_path = public
as $$
  select f.id,
         case when f.user_low = p_user_id then f.user_high else f.user_low end,
         count(m.id)
    from public.cl_friendships f
    left join public.cl_chat_reads r
      on r.user_id = p_user_id
     and r.conversation = 'dm:' || f.id
    left join public.cl_direct_messages m
      on m.friendship_id = f.id
     -- Your own messages are never unread to you.
     and m.sender_id <> p_user_id
     and m.id > coalesce(r.last_read_id, 0)
   where f.status = 'accepted'
     and (f.user_low = p_user_id or f.user_high = p_user_id)
   group by f.id, f.user_low, f.user_high;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Back-date a new user's cursors to "everything so far is read".
--
-- Without this, the first poll on an account that has been chatting for months
-- reports its entire history as unread. Runs once per account — the World Chat
-- row is the marker, since that conversation always exists.
--
-- In SQL rather than in the API because the API reads through PostgREST, which
-- caps rows: finding each thread's newest message by paging messages back would
-- silently seed a quiet thread at 0 whenever busier threads filled the page.
-- An aggregate has no such ceiling and needs one round trip.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.cl_chat_seed_reads(p_user_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  inserted integer;
begin
  if exists (
    select 1 from public.cl_chat_reads
     where user_id = p_user_id and conversation = 'world'
  ) then
    return false;
  end if;

  -- The UNION is wrapped so ON CONFLICT unambiguously belongs to the INSERT
  -- rather than trailing the last SELECT of the union.
  insert into public.cl_chat_reads (user_id, conversation, last_read_id)
  select * from (
    select p_user_id, 'world'::text, coalesce(max(id), 0)::bigint
      from public.cl_world_messages
    union all
    select p_user_id, 'dm:' || f.id, coalesce(max(m.id), 0)::bigint
      from public.cl_friendships f
      left join public.cl_direct_messages m on m.friendship_id = f.id
     where f.status = 'accepted'
       and (f.user_low = p_user_id or f.user_high = p_user_id)
     group by f.id
  ) as seed(user_id, conversation, last_read_id)
  -- Two clients seeding at once: the first write wins. Both compute the same
  -- answer, and DO NOTHING can never rewind a cursor the way an update could.
  on conflict (user_id, conversation) do nothing;

  -- ROW_COUNT is an integer, so it needs an integer to land in.
  get diagnostics inserted = row_count;
  return inserted > 0;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Advance a cursor, monotonically.
--
-- GREATEST inside the ON CONFLICT is the whole point: two clients marking the
-- same thread read at once, or a slow request landing after a newer one, must
-- not rewind the cursor and resurrect messages the user has already seen. Doing
-- this as read-then-write in the API would lose that race.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.cl_chat_mark_read(
  p_user_id uuid, p_conversation text, p_last_read_id bigint
)
returns bigint
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.cl_chat_reads (user_id, conversation, last_read_id, updated_at)
  values (p_user_id, p_conversation, greatest(p_last_read_id, 0), now())
  on conflict (user_id, conversation) do update
     set last_read_id = greatest(public.cl_chat_reads.last_read_id, excluded.last_read_id),
         updated_at   = now()
  returning last_read_id;
$$;

alter table public.cl_friendships enable row level security;
alter table public.cl_world_messages enable row level security;
alter table public.cl_direct_messages enable row level security;
alter table public.cl_chat_reads enable row level security;

-- Current Supabase projects make Data API exposure opt-in. Keep the intent
-- explicit on old and new projects: browser roles cannot touch chat rows.
revoke all on table public.cl_friendships, public.cl_world_messages,
                   public.cl_direct_messages, public.cl_chat_reads
  from anon, authenticated;
grant select, insert, update, delete
  on table public.cl_friendships, public.cl_world_messages,
           public.cl_direct_messages, public.cl_chat_reads
  to service_role;
grant usage, select
  on sequence public.cl_friendships_id_seq, public.cl_world_messages_id_seq, public.cl_direct_messages_id_seq
  to service_role;

-- SECURITY DEFINER functions run as their owner, so an EXECUTE grant to a
-- browser role would hand it a read of every friendship it names a uuid for.
-- The Express backend is the only caller and it uses the service key.
revoke all on function public.cl_chat_unread(uuid) from public, anon, authenticated;
revoke all on function public.cl_chat_seed_reads(uuid) from public, anon, authenticated;
revoke all on function public.cl_chat_mark_read(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.cl_chat_unread(uuid) to service_role;
grant execute on function public.cl_chat_seed_reads(uuid) to service_role;
grant execute on function public.cl_chat_mark_read(uuid, text, bigint) to service_role;
