-- ═══════════════════════════════════════════════════════════════════════════
-- cl_passkeys — WebAuthn credentials for passwordless ChainLens sign-in
--
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: every statement is IF NOT EXISTS / OR REPLACE.
--
-- Until this table exists the passkey endpoints return 503 and the UI hides
-- the passkey buttons, so deploying the server before running this is fine —
-- nothing else breaks.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.cl_passkeys (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.cl_users(id) on delete cascade,

  -- Base64URL credential id from the authenticator. Globally unique: two
  -- accounts can never claim the same credential, which is what makes the
  -- discoverable-credential login (no username typed) safe to resolve.
  credential_id text not null unique,

  -- Base64URL COSE public key. Public by definition — the private half never
  -- leaves the authenticator, so a database leak does not let anyone sign in.
  public_key    text not null,

  -- Signature counter. Many synced passkeys (iCloud Keychain, Google Password
  -- Manager) always report 0; the verifier skips the clone check in that case.
  counter       bigint not null default 0,

  transports    text[],
  device_type   text,     -- 'singleDevice' | 'multiDevice'
  backed_up     boolean not null default false,
  label         text,     -- user-facing name, e.g. "Pixel 8" or "Windows Hello"

  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create index if not exists cl_passkeys_user_id_idx on public.cl_passkeys(user_id);

-- ⚠ REQUIRES A REAL service_role KEY IN SUPABASE_SERVICE_KEY.
--
-- RLS below is enabled with NO policies, so ONLY a key that bypasses RLS can
-- read or write this table. That is deliberate and must not be "fixed" by
-- disabling RLS or adding a permissive policy: anyone able to INSERT here could
-- map their own passkey to someone else's user_id, and /api/auth/passkey/login
-- would then hand them a JWT for that account. Total takeover, not a leak.
--
-- Symptom of a non-service key (measured on production 2026-08-06):
--   passkey register error: new row violates row-level security policy
-- while /available and the profile still work — because cl_users, cl_wallets
-- and cl_linked_accounts have RLS DISABLED, so any key can reach those. Fix the
-- key, not this file. (Those three tables having RLS off is itself worth fixing.)

-- The backend talks to Supabase with the service key, which bypasses RLS.
-- Enable it anyway so that if an anon/public key is ever pointed at this table
-- it reads nothing: no policies are defined, so every non-service request is
-- denied by default.
alter table public.cl_passkeys enable row level security;
