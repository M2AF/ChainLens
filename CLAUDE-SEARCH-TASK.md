# Claude task: action intent and public identity search

The user asked Codex and Claude to implement four ChainLens search additions
together. Codex owns asset/collection lookup, transaction lookup, search UI,
shared route wiring and final integration. Your two tasks are below.

## Checkout and handoff

Work ONLY in the prepared detached worktree:
`C:\Users\balla\Desktop\ChainLens\chainlens-claude-search`.
Base HEAD is `4cc9f0e`. Main checkout has uncommitted .nad support; do not reset
or copy over it. Your modules must not depend on that unfinished source.

Read your `agent-handoff` SKILL.md and use the shared main board/ledger:
`C:\Users\balla\Desktop\ChainLens\chainlens`.
Run status there, then claim a scoped lease (not the main lease):

```powershell
$h = 'C:/Users/balla/.claude/skills/agent-handoff/scripts/handoff.py'
python $h --dir C:/Users/balla/Desktop/ChainLens/chainlens status
python $h --dir C:/Users/balla/Desktop/ChainLens/chainlens lease-claim claude claude-search 'Action intent and public identity search' --repo C:/Users/balla/Desktop/ChainLens/chainlens-claude-search --resource search/actions --resource search/people
```

Stop if that claim conflicts. Do not force it. Use lease-log checkpoints and
lease-release when finished; never rewrite the main HANDOFF.md. Keep a pickup
note in your worktree at `docs/CLAUDE-SEARCH-RESULTS.md`.

## 1. Action intent module

Create `public/search-actions.js` (browser global `ChainLensSearchActions` plus
CommonJS exports) and `test/search-actions.test.js`.
Export `parseActionIntent(query)` returning null or:
`{ action, fromChain, toChain, chain, asset, query, appQuery }`.
Supported actions: bridge, stake, lend, swap. Optional fields are null.
Examples: “bridge Monad to Solana”, “stake SOL”, “lend USDC on Base”,
“swap ADA to USDC on Cardano”. Normalize known aliases using the current chain
catalog; keep asset text as a search term, never infer a contract from a ticker.
Do not pretend an app/route is executable based on name/category alone.
Export `matchActionApps(apps, intent)` returning ranked existing App Hub records.
Inspect `public/search-intent.js` and app-hub-data.js before implementing; use
their actual category/tag/chain shapes. Unsupported/ambiguous requests must
return useful discovery without inventing providers, routes or rates.
Tests must cover aliases, source/destination direction, contradictory/unknown
chains, unsupported actions, multi-chain filtering and no mutation of app data.

## 2. Public identity search service

Create `people-search-service.js` and `test/people-search.test.js`.
Export `createPeopleSearch({db})`, returning an object with
`search({q, address, chain}) -> {people: [...], truncated: boolean}`.
q searches display names; address+chain optionally finds public linked-wallet
matches. Codex resolves domain names and supplies the address, so your service
does not fetch any domain provider. Match only public wallet links when
`public_wallets` is effectively enabled, consistent with existing profiles.
Public name matches can still appear when wallets are hidden, but MUST NOT
include an address-match indication or wallet data from that hidden linkage.
Use explicit allowlisted columns and output only
`{id,display_name,avatar_url,avatar_nft_key,banner_url,match:'name'|'public-wallet'}`.
Never return email, linked-social credentials, passkeys, sessions, provider IDs,
private filters or wallet address lists. Never call a wallet match verified
ownership: watch-only links are permitted in existing profiles.
Inspect profile-social-service.js, chat-service.js and schema files READ ONLY
for actual table/column/default/chain names. Bound queries and output to 10
profiles, trim/validate inputs, escape LIKE wildcards, deduplicate users, order
exact name matches before prefixes, and surface DB outage as 503 rather than
an empty success. Do not add schema/index/migration changes.
Use injected fake DB tests, including privacy toggle, duplicate wallets, query
escaping, case-sensitive non-EVM addresses, null/default flags, errors and caps.

## Allowed edits / forbidden edits

Only edit the five task files named above and your pickup note. If you need a
different file, explain it in the pickup note and coordinate before touching it.
DO NOT edit main checkout, backend-server.js, public/index.html,
public/search-page.jsx, public/search-intent.js, public/chain-catalog.js,
nad-resolver.js, profile-social-service.js, existing tests or package files.
DO NOT edit Magic Money Wallet, Workers, swap execution/signing/fees/bridges,
auth/session/RLS/privacy settings, NFT filtering or existing wallet/profile UI.
No live database reads/writes, production API test traffic, dependency install,
commit/push/merge/deploy/tag, branch change, or wallet signing/broadcast.
Do not start a server on Codex's port10777; your modules only need Node tests.

## Delivery

Run your two Node test files with network fully stubbed. Describe architecture,
API contracts, edge cases, exact commands/results and remaining limitations.
Release your scoped lease, then tell the user the worktree and pickup note are
ready for Codex to review/integrate. Do not integrate into main yourself.
