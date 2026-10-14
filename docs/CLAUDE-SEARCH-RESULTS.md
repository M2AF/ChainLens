# Claude search modules: pickup note

## Codex integration addendum

The sections below preserve Claude's original delivery snapshot. The reviewed
modules are now integrated into the main ChainLens checkout. Codex added route
wiring, existing optional JWT/rate/block middleware, result UI and eight-second
DB abort signals. Public-wallet candidate reads are capped at 50 before privacy
filtering, so visible profiles behind hidden candidates are not dropped; hidden
matches do not affect truncation. Action-only overrides exclude retired Lido SOL/
Polygon staking and THORChain's unsupported Monad/Solana action matches using
primary documentation. Original App Hub records are unchanged. Final evidence:
`docs/SEARCH-EXPANSION.md` (271 unit tests, 10 final feature browser cases and
16 existing regression cases pass).

Worktree: `chainlens-claude-search` (detached at `4cc9f0e`). New files only; nothing
committed, merged, deployed or run against a live DB/network.

| File | Purpose |
|---|---|
| `public/search-actions.js` | `parseActionIntent`, `matchActionApps` (browser global `ChainLensSearchActions` + CommonJS) |
| `test/search-actions.test.js` | 9 cases |
| `people-search-service.js` | `createPeopleSearch({db})` -> `search({q,address,chain})` |
| `test/people-search.test.js` | 12 cases, injected fake DB |

## Verification

```
node --test test/search-actions.test.js test/people-search.test.js   # 21 pass, 0 fail
node --test test/search-intent.test.js                               # 5 pass (untouched)
node --check people-search-service.js && node --check public/search-actions.js
```
No network or database is touched by these tests. Also confirmed the browser build
loads in a `vm` context (chain-catalog.js then search-actions.js) and parses
"bridge Monad to Solana". The full `npm test` suite was not run (main checkout is
dirty and Codex owns integration).

## 1. Action intent (`public/search-actions.js`)

Load order in the browser: `chain-catalog.js` before `search-actions.js`
(without the catalog every chain is simply unknown; nothing throws).

`parseActionIntent(query)` -> `null` or
`{action, fromChain, toChain, chain, asset, query, appQuery}`.

- Actions: bridge, stake, lend, swap (plus -ing forms). The action word must lead
  the query after filler like "how to"/"I want to"; "best bridges", "mint NFT",
  "trade ETH", empty or >200 chars -> `null` so existing search runs.
- Chains use catalog ids (`monad`, `hyperevm`), resolved from id, label, a few
  aliases (arb, op, matic, world, hyperliquid, eth) and unique native tickers.
- Bridge: `from X`/subject chain = `fromChain`, `to Y` = `toChain`,
  `on Z` alone = `chain`. Swap `to` is the target asset unless it is a chain name.
- Same from/to, or two different chains in one role -> that role is `null`.
  Unknown words in a chain slot are dropped (never invented); in the subject slot
  they stay as `asset` text.
- `asset` is the first asset phrase as typed ("USDC", a pasted 0x address). Never
  resolved to a contract. For swaps only the source asset is exposed; the target
  asset is not (spec shape is fixed). Adding `toAsset` is a small follow-up if wanted.
- Native-ticker hint (`stake SOL` -> `chain: 'solana'`) only for non-bridge actions,
  only when exactly one chain is implied, never for USDC/USDT/DAI or ambiguous ETH.
- `appQuery` is a string for the existing `ChainLensSearchIntent.rankApps`
  (action word + App Hub chain ids, `hyperevm` -> `hype`, plus any `via X` term).

`matchActionApps(apps, intent)` -> ranked array of the **original** App Hub records.
Does not mutate, copy-extend or annotate them, and never claims a route/rate.

- Evidence required: bridge = category Bridge/Interoperability or "bridge" in
  name/tags/description; swap = category DEX or "swap"; stake/lend = keyword in
  text (DeFi category is only a ranking bonus).
- Every chain named in the intent (from, to, chain) must be in `app.chains`;
  partial support is excluded. No match -> `[]`; caller falls back to normal search.
- Score: category 100, keywords 20-30, chain 30 each, asset text +15, featured +2;
  ties by name then id.
- Matching apps means "worth looking at", not "executable". Codex must not show a
  swap/bridge button from this alone.

## 2. People search (`people-search-service.js`)

`search({q, address, chain})` -> `{people: [{id, display_name, avatar_url,
avatar_nft_key, banner_url, match: 'name'|'public-wallet'}], truncated}`.

- Reads only `cl_users` (explicit `USER_COLUMNS`, includes `public_wallets` for the
  gate but never returned) and `cl_wallets(user_id)` filtered by chain+address.
  Table/column/chain semantics copied from `profile-social-service.js`
  (`public_wallets !== false` = enabled; EVM stored as chain `evm`, lowercase).
- `q`: trimmed, control chars stripped, 2-64 chars. Shorter/blank -> empty success
  (no DB call). Longer or non-string -> error with `status: 400`.
- Name search: three bounded `ilike` queries (exact, prefix, contains; 11 rows each);
  `\ % _` escaped, `*` neutralised, every row re-verified in JS. Order: exact,
  prefix, contains, then name, id.
- `address`: needs a valid chain match. `chain` may be `evm`, any EVM catalog id
  (`base`...), or a profile wallet type; omitted -> auto-detected. Invalid ->
  `status: 400`. EVM lowercased; non-EVM case-sensitive.
- Wallet matches come first with `match:'public-wallet'` only when
  `public_wallets !== false`. Hidden-wallet users can still appear by name with
  `match:'name'` and no wallet data. A match means "linked", possibly watch-only;
  it is not ownership verification.
- Max 10 people; `truncated` when more matched or the wallet row cap (50) was hit.
- DB missing/errored/thrown -> error with `status: 503`
  (`People search is temporarily unavailable`), never an empty result.
- Not done here: auth, rate limiting, block-list filtering and route wiring.
  Codex's route should apply the same rateLimit used by `/api/profiles/:id`, map
  `error.status` to the response, and decide whether to filter blocked users
  (`profile-community-service.blockedIds`) for signed-in callers.

## Limitations / follow-ups

- Contains-search (`%q%`) on `cl_users.display_name` has no trigram index; I was
  told not to add schema, so large tables may scan. Capped at 11 rows per query.
- Display names are not unique; several people can match one name.
- App Hub has no staking/lending tags, so stake/lend rely on description keywords.
- Unknown chains (e.g. BNB, absent from the catalog) are dropped, not guessed.
- No files outside the five task files and this note were touched.
