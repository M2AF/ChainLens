-- ═══════════════════════════════════════════════════════════════════════════
-- cl_asset_filters — the assets a ChainLens account has chosen to hide
--
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: every statement is IF NOT EXISTS / OR REPLACE.
--
-- Until this table exists, both readers treat it as "nothing hidden" and both
-- writers fail quietly, so the wallet and the website keep using their local
-- lists exactly as they did before syncing existed. Deploying the server and the
-- Worker before running this is fine — nothing breaks, sync just does nothing.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.cl_asset_filters (
  -- One row per account: the whole list is a single document, because it is only
  -- ever read and written whole. A row-per-asset table would turn one login into
  -- a query returning thousands of scam-token rows for no gain.
  user_id    uuid primary key references public.cl_users(id) on delete cascade,

  -- { "<canonical asset key>": { "s": "h" | "s" | "a", "t": <epoch ms> } }
  --
  --   s = state   h hidden · s marked spam · a explicitly restored
  --   t = when the decision was taken, which is what makes concurrent edits from
  --       two devices converge (newest wins, per key)
  --
  -- 'a' is a TOMBSTONE, not an absence. Restoring an asset has to out-rank the
  -- older hide still held by the other device; deleting the key instead would let
  -- that device re-add it on its next push, and the asset would never come back.
  --
  -- The key format is a wire contract shared by MagicMoney Wallet and this site —
  -- see public/asset-filter-key.js. Keys written by older clients live here
  -- forever, so that format is versioned ("…:t:…" / "…:n:…" is v1) and must be
  -- extended rather than changed.
  entries    jsonb not null default '{}'::jsonb,

  updated_at timestamptz not null default now()
);

-- ⚠ REQUIRES A REAL service_role KEY IN SUPABASE_SERVICE_KEY.
--
-- RLS is enabled with NO policies, so only a key that bypasses RLS can read or
-- write. Do not "fix" this by adding a permissive policy: anyone able to write
-- here could hide arbitrary assets in someone else's wallet — including hiding a
-- real holding so it disappears from their portfolio, or un-hiding a phishing
-- airdrop the spam filter caught. Writes are authorized above this table instead:
-- the website by JWT (backend-server.js) and the wallet by an EIP-191 ownership
-- signature the Worker verifies (cloudflare-worker/db.js).
alter table public.cl_asset_filters enable row level security;