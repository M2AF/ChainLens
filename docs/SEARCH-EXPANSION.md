# ChainLens search expansion

Codex and Claude implemented the four requested search additions together.
Claude supplied action matching and allowlisted people search in the detached
`chainlens-claude-search` worktree; Codex reviewed/copied those modules and owns
backend wiring, result UI, assets/transactions, privacy refinements and QA.
The original expansion is in user commit e652796. The follow-up separating token
and collection results is local and uncommitted. No agent deployment, signing,
transaction broadcast, new dependency or database/schema change occurred.

## Behavior and examples

Token and NFT/collection results search automatically in separate sections, each
with its own network selector. NFTs/collections appear above tokens. Tokens show
three results initially; Show more reveals all already-loaded results, and Show
less restores the preview. A new search, network change or retry collapses it.
There is no result-type dropdown. Network phrases
such as `emonad on monad blockchain` search for `emonad` on Monad in both sections.
Transaction searches retain their dedicated section and network selector.

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

## Separate result sections follow-up

On user HEAD e652796, 271 Node tests, syntax checks and compilation of all 13 JSX
scripts pass. Eleven affected browser cases pass, including automatic token and
collection searches, independent network changes and desktop/mobile overflow
checks. Both split-result screenshots were reviewed. Logs:
`.local-artifacts/search-expansion/separate-unit.log` and
`.local-artifacts/search-expansion/separate-verified-e2e.log`.

## App Hub search regression follow-up

App results remain independent of asset classification: `NFT marketplaces` can
show NFT Marketplace apps even though `NFT` also introduces an NFT lookup.
Catalog category phrases and tags are matched before individual aliases, and
exact app names take precedence over category/chain words and action parsing.
The same rules apply when opening App Hub with the search query.

Catalog-driven tests cover all 17 categories and their short labels, all 19
chain labels, every app name, and all 323 category/chain combinations. Optional
tags are tested with fixtures (the current App Hub records have no explicit
`tags` arrays), including tags containing category words. Chain restrictions
remain enforced. Evidence: `.local-artifacts/search-expansion/apphub-*.log`.

Validation on user HEAD d3237b1 plus this fix: 275 Node tests, syntax checks and
13 compiled JSX scripts pass. Nine affected browser cases pass across runs;
the final extended marketplace/category/name/Cardano navigation test passes
in `apphub-marketplaces-verified-e2e.log`. Desktop/mobile screenshots reviewed;
long mobile headings now wrap. The first extended test hit its total timeout;
subsequent fixture assumptions (preview limit and exact app label) were corrected.
No agent commit or deployment.

## UUID avatar and legacy account audit

UUID/profile-link results now use the shared ProfileAvatar component at 56px,
matching display-name results. NFT-backed photos retain the animated hexagon;
custom uploads remain circular. All 13 JSX scripts compile. A targeted browser
flow verifies name/UUID/profile-link NFT avatars and uploaded-photo fallback;
desktop/mobile screenshots reviewed. `id-avatar-e2e.log` records the pass.

Read-only production audit on October 13 confirmed two empty legacy accounts:
`a32b355b-3ca2-497a-9f3d-6657cd7faedf` (Discord) and
`f8c86cbe-4199-44ab-bb07-2e2fee2341e5` (Google). Both primary logins already exist
in linked accounts for current ID `ec18dcf5-3271-46fd-8029-41e5b2f39eed`.
All dependent rows are zero, including wallets, passkeys, favorites, filters,
chat, friendships, blocks, reports and themes. Google/Discord login callbacks
check linked accounts first, so they select current ID.

`sql/cl_cleanup_legacy_criptoejesus_accounts.sql` was applied October 13 after explicit user approval.
It locks the exact account rows, verifies login links and every referencing FK
has zero data, and removes only the two legacy IDs. Read-only audit preceded approval. Cleanup verification confirms both old IDs are
absent and current account still has 9 wallets, 2 linked logins, 5 passkeys and
15 favorite rows. Live search for `criptoejəsus` returns only current ID; plain
`criptoejesus` no longer finds the removed Google record. Name search currently
requires matching spelling; Unicode lookalike folding is not implemented.

## NFT marketplace links and token preview

On user HEAD 7ec849d, the NFT/collection section precedes tokens. Marketplace
links use validated identities and fixed destinations: Cardano policy collections
on Wayup, supported EVM contracts on OpenSea, and Solana NFT mints on Magic Eden.
Loaded Solana collection matches link to a sample NFT when its mint is available;
no invented collection slug is used. OpenSea's current public chain list excludes
Gnosis and WorldChain, so those keep explorer links without a false marketplace
link. Native ADA has no policy; non-native Cardano results show the complete
56-character Policy ID with Copy. Complete asset units retain a separate Copy.

Primary sources checked October 13:
- Wayup collection route: https://www.wayup.io/collection/da286f15e0de865e3d50fec6fa0484d7e2309671dc4ba8ce6bdd122b/analytics
- OpenSea supported chains: https://docs.opensea.io/reference/get_chains and its public `/api/v2/chains` response.
- OpenSea contract route live probe returns307 to `/en-US/collection/sappy-seals` for the known Ethereum Sappy contract.
- Magic Eden item details: https://help.magiceden.io/en/articles/6531562-how-to-view-nft-details-and-metadata-on-magic-eden

All 13 JSX scripts compile; 13 relevant Node tests and 7 affected browser cases
pass. Desktop/mobile screenshots reviewed for preview, marketplace links and
full-policy Copy. Show more makes no additional request; new networks reset to
three, and lists with fewer results have no expansion button. Evidence:
`.local-artifacts/search-expansion/nft-marketplace-{unit,e2e}.log` and
`test-results/search-{token-preview,nft-marketplaces}-{1440,390}.png`.
The user committed this exact tested frontend source as 5e4b223 while verification
was finishing. Source/tests have no remaining diff; documentation updates remain
local. Deployment was not verified; no agent deployment or database change.
