# ChainLens search expansion

Codex and Claude implemented the four requested search additions together.
Claude supplied action matching and allowlisted people search in the detached
`chainlens-claude-search` worktree; Codex reviewed/copied those modules and owns
backend wiring, result UI, assets/transactions, privacy refinements and QA.
Both agents' work is uncommitted. No deployment, signing, transaction broadcast,
new dependency or database/schema change occurred.

## Behavior and examples

- `token USDC on Base`: chain-qualified token discovery. Names can search across
  networks; contracts/mints require a network. Native currencies are explicit
  and have no invented contract address or copyable placeholder.
- `collection Sappy Seals`: searches the bounded ChainLens collection index and
  the user's already-loaded, spam-filtered NFT collections. Exact EVM contracts,
  Solana NFT mints (existing Helius configuration), Cardano policies and Cardano
  asset units use provider/on-chain metadata. Name coverage is not a complete
  global NFT catalog; the UI says so and supports exact identities.
- A transaction hash, `tx <hash> on Base`, or an allowlisted mainnet explorer URL
  shows status, native value/fee where provided and a bounded transfer/output
  summary. Bare hashes ask for a network. Supports configured EVM networks,
  Solana, Bitcoin and Cardano. Missing is distinct from pending, failures and
  provider outages. ERC20/721/1155 and parsed Solana transfers are summarized;
  BTC/Cardano show outputs. Raw token units are labeled; no decimals are guessed.
- `bridge Monad to Solana`, `stake SOL`, `lend USDC on Base`, or
  `swap ADA to USDC on Cardano`: deterministic intent matching ranks existing
  App Hub tools, preserving action filtering when opening App Hub. Discovery
  does not produce a quote, execute a swap, or establish route availability.
- `Collector`, `@Collector`, `profile Collector`, a wallet or supported domain:
  finds public profiles by name or publicly linked wallet. Domain matching
  respects public-wallet visibility, including watch-only links. Hidden-wallet
  matches neither appear nor influence the more-results indicator. Signed-in
  searches exclude blocked peers. JWT verification stays in the existing auth
  middleware; public name searches also work anonymously.

Existing UUID/profile links, ENS/UD/SNS/ADA Handle and .nad search/scanning stay
available. .nad address results feed profile search and Scanner without another
NNS lookup. Public identity output includes only id, display name, avatar URL,
NFT-avatar key, banner and a match reason; never email, provider/social/passkey
credentials, filters, session data or wallet lists.

## Architecture review

The existing Search page combines a hosted web-search Worker, deterministic
App Hub ranking and scanner/profile links. The extension adds independent,
read-only result sections and small service modules, reusing token discovery,
chain configuration, avatar rendering and existing auth/rate/block helpers.
Every upstream URL is fixed by the service/network; pasted explorer URLs are
parsed against a host allowlist and are never fetched directly.

An AI intent pipeline or a new global collection database would add cost,
dependencies, operational state and unreliable route assumptions. The chosen
approach keeps contracts explicit and runtime errors local to each section.
Caching is bounded; metadata lookups time out; DB reads have explicit allowlists,
query/output caps, escaped name patterns and an eight-second abort signal.
No-store HTTP responses preserve current public-wallet/block preferences.

Maintenance limits: name searches have no new trigram index; collection-name
coverage is indexed/loaded data; provider coverage and configured keys still
matter. RPC/explorer maps and action coverage need periodic review. Action-only
overrides prevent broad stale App Hub tags from suggesting retired Lido SOL/
Polygon staking or unsupported THORChain Monad/Solana paths. Search never edits
the App Hub source pipeline or any existing swap execution/fee/signer logic.

## Changed files

- Backend: `backend-server.js`, `search-asset-service.js`,
  `search-transaction-service.js`, `search-entity-routes.js`,
  `people-search-service.js`, `search-people-routes.js`.
- Frontend: `public/index.html`, `public/search-page.jsx`,
  `public/search-entities.js`, `public/search-entity-results.jsx`,
  `public/search-actions.js`, `public/search-people-results.jsx`.
- Tests: `test/search-entities.test.js`, `test/search-actions.test.js`,
  `test/people-search.test.js`, `test/search-people-routes.test.js`,
  `e2e/search-entities.spec.js`, `e2e/search-actions-people.spec.js`.
- Shared notes/ledger: `CLAUDE-SEARCH-TASK.md`, `HANDOFF*`, this document and
  `docs/CLAUDE-SEARCH-RESULTS.md`. Prior uncommitted .nad work is preserved.

## Verification

- `npm run check`: passes; new modules load through the unit suite.
- Full `npm test`: **271 pass**; DB/API tests use injected fixtures. One test
  exercises the real Supabase JS client with a stubbed transport, verifying the
  exact read-only columns/limits without a production DB query.
- Precompiled homepage: **13 JSX assets** compile successfully.
- Final feature browser suite: **10 pass**, no retries; includes Copy, exact
  explorer URLs, network ambiguity, native ADA, asset-source failures, cached
  collection reuse/spam filtering, action/App Hub handoff, public name/domain
  profiles, existing NFT avatars, .nad reuse and mobile overflow checks.
- Existing profile/chat/NFT/linked-wallet regression suite: **16 pass**.
- Screenshots reviewed: desktop assets/actions/people and mobile transaction/
  staking. Screenshot review caught a duplicate panel caused by sibling React
  key collision; separate people/entity key prefixes fix it and a regression
  asserts one panel and no duplicate-key console error.
- Read-only live probes: .nad resolution succeeds on Monad chain143; Sappy Seals
  metadata returns ERC721 via public Ethereum RPC; generic Koios policy lookup
  returns five Mallard Order samples. These do not prove every provider/network
  or deployed production integration.

Evidence: `.local-artifacts/search-expansion/{final-unit,final-e2e,regression-e2e}.log`
and `screenshots/`. Production needs backend/frontend deployed together. No
agent commit/push/deploy; no Magic Money source/native runtime change.

## Primary sources checked October 13, 2026

- [Alchemy NFT metadata endpoints](https://www.alchemy.com/docs/reference/nft-api-endpoints)
- [Alchemy retired name-search endpoints](https://www.alchemy.com/docs/changelog/2026/8/18)
- [Helius DAS getAsset](https://www.helius.dev/blog/how-to-fetch-newly-minted-tokens-with-helius)
- [Koios OpenAPI](https://api.koios.rest/koiosapi.yaml)
- [Supabase select](https://supabase.com/docs/reference/javascript/select)
  and [ilike](https://supabase.com/docs/reference/javascript/ilike)
- [Lido Solana sunset](https://blog.lido.fi/sunset-lido-on-solana/)
  and [Polygon sunset](https://blog.lido.fi/lido-on-polygon-sunset/)
- [THORChain native networks](https://docs.thorchain.org/what-is-thorchain-and-rune)
