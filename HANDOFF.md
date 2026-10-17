# Handoff board — ChainLens
<!-- handoff v1. LIVE STATE ONLY: rewrite in place, keep under ~60 lines.
     History goes in HANDOFF_LOG.md. Machine fields above the first ## are managed by handoff.py. -->

owner: none
task: -
lease_until: -
repo: .
verify: npm run check && npm test
verified: 9e14feb · Baseline syntax/check and 279 Node tests pass · 2026-10-16T22:14-03:00
head: 9e14feb (main) dirty 8
updated: 2026-10-16T22:37-03:00 · codex

resources: ["auth/duo-sso", "public/duo-connect"]

## Now
- DUO shared social login reuses existing ChainLens OAuth apps via allowlisted login_provider Google/Discord hints; all 3 buttons resolve same account. No existing .env secrets copied/printed or account/DB changes. 3 updated bridge tests and two-server 3-provider browser flow pass. Live bridge URLs still serve HTML fallback; deploy module/page and allowlist all 3 DUO callback paths to activate. See docs/DUO-ARCADE-SSO.md.
- DUO SSO bridge local/uncommitted: duo-sso.js + one backend mount + public/duo-connect HTML/CSS/JS; existing account/login/create flow and explicit consent, 60sec one-use PKCE code/token, only accountID/displayname shared. 282 Node/check and two-server browser flow pass using stub account store. No DB writes/provider config/deploy; docs/DUO-ARCADE-SSO.md gives future Arcade agent exact callback/env/route contract. Preserve unrelated dirty Profile UI/e2e.
- Profile owner friendrequests sidebar on user HEAD9e14feb complete locally: directlyunderSignout/abovePublicsettings; incomingNFTaware avatar/name/UUID/profilelink,Accept/Decline;20secvisible/focus/socialrefresh, stale-readguard,errorRetry,scrolllist. Usesexistingauthfriend APIs/ownership/eligibility.14JSX/12distinctaffectedbrowser cases acrossruns pass;finalaccept->Chatfriendsflow passes33sec. Desktop/mobile screenshots reviewed. docs/PROFILE-FRIEND-REQUESTS.md; profile-requests-{e2e,final-e2e,accept-e2e}.log. No backend/DB/productionfriendship/commit/deployment change.
- On user HEADed2b07a (favorites alignment committed), username display nowcompact like ChainLensID: fit-content11pxmono chip, adjacent smallCopy/Edit, mobile9px, inlineCopiedfeedback; editableform remains roomy.3username browser workflows pass inclwidth/height/gap/copy/edit/reload/public/search/mobileoverflow;14JSX compile; desktop/mobile screenshots reviewed. username-compact-e2e.log; docs/PROFILE-USERNAMES.md. LocalUI uncommitted, noDB/backend/deploy.
- On user HEAD4c03d08 (username source committed), publicfavorites cardalignment fixed locally: top-aligned flex, square containart, two-line title reserve/clamp andconsistentcaption offsets.6public-profile browser cases pass incl1440/1080/390 geometry/mixedratio/captions/detailclick; all3screenshots reviewed. favorites-alignment-e2e.log; favorites-aligned-{1440,1080,390}.png; docs/PUBLIC-PROFILE-GALLERY.md. CSS/test/docs uncommitted; no data/backend/deployment change.
- Unique ChainLens username feature on user HEAD1fc7cb3 complete locally: authenticatedatomic claim/edit route, one canonical3–24ASCII handle perUUID, globalunique lower index; ownerpanel aboveID withCopy, publicidentity andusername/displayname search incl@actionwords. Migration20261014022747 applied to vxrhosrktbknogyeyewy; nullablefield andformat/uniqueness verified via tempclone+rollback, no realusername claimed.279Node/check/14JSX/20distinct affectedbrowser cases acrossruns pass; final3username visualrerun pass andscreenshots reviewed. Source/untrackedmodules/docs uncommitted; frontend+backend deployment pending. docs/PROFILE-USERNAMES.md.
- On current user HEAD5e4b223 (search source/tests committed during verification), NFT-first results and3token preview Showmore/Showless are complete. Expands alreadyloadedtokens without request; resets newquery/network/retry. Safe marketplace links Wayup policy/OpenSea supportedEVM contract/MagicEden mint orcachedsample; Cardano fullPolicyID Copy and separateassetunit Copy.13entityNode/13JSX/7affectedbrowser pass; desktop/mobile screenshots reviewed. nft-marketplace-{unit,e2e}.log; search-{token-preview,nft-marketplaces}-{1440,390}.png. Source/testdiff is empty; docs remain dirty. No agentcommit/deploy/DBwrite; deployment unverified.
- UUID/profile-link search avatar uses shared ProfileAvatar56px; NFThex and uploadcircle parity verified by1browser flow and13JSX compile, desktop/mobile screenshots reviewed. Local uncommitted. User-approved live cleanup removed only empty legacyDiscord a32b355b andGoogle f8c86cbe after loginmapping/FK guards; currentec18dcf5 remains9wallets2logins5passkeys15favorite rows. Live schwa-name search returns onlycurrent; plain-e spelling returnsnone (noUnicodefolding). sql/cl_cleanup_legacy_criptoejesus_accounts.sql historical APPLIED script; refuses repeat. No source deploy/agentcommit.
- AppHub search fix on user HEAD d3237b1 is local/uncommitted: entity classification no longer hides catalog apps; category/tag phrases match before word aliases, exact app names override category/chain/action words, AppHub navigation uses same rule. Catalog audit all17categories/short labels/19chains/allappnames/323category-chain pairs and optionaltag fixtures passes.275Node/syntax/13JSX and9affectedbrowser cases pass across runs; final marketplace button/fullcategory/name/Cardano AppHub navigation and mobile heading-wrap case passes32sec. Screenshots reviewed. apphub-{unit,check,e2e,marketplaces-verified-e2e}.log; no agent commit/deploy.
- Search expansion is in user commit e652796. Follow-up locally separates automatic Tokens and NFTs/collections results, retaining independent network selectors and transaction section. Natural suffix such as emonad on monad blockchain selects Monad in both.271Node/13compiledJSX/syntax and11affected browser checks pass; desktop/mobile screenshots reviewed. Source uncommitted; no agent commit/deploy/MM/DB change. Evidence .local-artifacts/search-expansion/separate-{unit,verified-e2e}.log; test-results/search-separate-{1440,390}.png.
- .nad search complete locally on user HEAD4cc9f0e: mainnet NNS resolver via existing ethers, normalized namehash, fixed public RPCs with timeout/fallback/60sec bounded cache. Search shows resolved address/Copy/Scan and reuses address; direct Scanner .nad dispatch uses nad route. Live criptoejesus.nad resolves01faf6df...5efe13; RPC chain143. Syntax/11JSX/234Node/10browser pass; desktop/mobile screenshots reviewed. Source/tests/docs uncommitted; no agent deploy/new SDK/key/backend DB changes.
- Linked-wallet owner UI is in user commit4cc9f0e: compact wallet-style rows, full wrapping addresses/exact Copy feedback, stacked Rename/Remove and inline primary action. Prior228Node/9browser checks and desktop/mobile screenshots pass; source preserved in this task.
- Chat sizing/overflow is in user commit4dd857d; current syntax/228Node/11JSX pass. 40px avatars,36px presence; contained NFT rotation; media/text fit.17 affected browser cases covered across runs; final width+unread2pass after startup allowance. Desktop/mobile/popout screenshots reviewed.
- NFT PFP work remains in scope of prior shared feature: cached searchable/scrollable spam-filtered picker, NFT-detail action, shared avatar_nft_key, animated NFT hexagons and circular uploads. Shared Supabase migration20261013012323 applied; existing pictures need NFT reselection once. App/Worker deployment and native runtime sync QA remain separate. Companion wallet final local gate exits0:2520unit/91browser+1history retry+1skip; no agent release/install.

## Next
- Arcade/deployment agent reads docs/DUO-ARCADE-SSO.md; deploy bridge and allowlist DUO /auth/{chainlens,google,discord}/callback paths when authorized. Preserve existing Profile UI/e2e work.

## Traps
- Collection-name coverage is bounded indexed/loaded NFT data, not a global catalog. Exact identities use chain/provider reads. Hidden wallets must not influence match reasons/count hints; signed-in search filters blocks. Raw quantities are not token-decimal guesses. Action discovery does not prove route availability.
- NNS older SDK constant3019BF is testnet; mainnet Cc7a1bfF is documented separately. Resolve record, never substitute name owner for an unset wallet. Network outage503 differs from no address404.
- Only the lease owner edits shared code; preserve dirty work. No commit/push/deploy/install/sign/broadcast without user authorization.
- clip-path alone does not contain the animated NFT pseudo-element for scroll sizing: retain overflow:hidden on the avatar. Reproduced9px right-edge feed overflow before fix.
- Native Android/iOS runtime and production profile sync are separate from local browser/TypeScript/build results.
- Existing NFT source cannot be inferred from image URL; uploaded photos remain circular, and legacy pictures need explicit NFT reselection.
- Public profile allowlist omits email/provider/social credentials; wallet visibility is user-controlled. Favorites expose only active mainnet favorites, never tombstones/filter documents. Browser database grants remain revoked/RLS enabled.
- Deploy NFT-session/index/profile scripts together; Scanner shares the profile cache. NFT provider metadata needs normalized traits and bounded URI/DNS fetching.
- Full older theme/media/provider guardrails are retained in HANDOFF_ARCHIVE.md (snapshot2026-10-12); read them before touching those systems.

## Skills
- Search architecture/privacy -> architecture-review / supabase:supabase | used: deterministic/read-only modules, provider caps, DB allowlists, SDK stub verification and primary docs | Codex: C:/Users/balla/.codex/skills/architecture-review/SKILL.md; C:/Users/balla/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md | Claude: resolve catalog.
- Chat UI -> Fullstack Iteration / Visual Iteration / Playwright Testing | used: source tracing, before/after overflow regression, responsive browser checks and screenshots | Codex: C:/Users/balla/.codex/skills/{fullstack-iteration,visual-Iteration,playwright-testing}/SKILL.md | Claude: resolve local catalog.
- Shared project -> agent-handoff | used: lease, checkpoints, evidence and archived live-board history | Codex: C:/Users/balla/.codex/skills/agent-handoff/SKILL.md | Claude: C:/Users/balla/.claude/skills/agent-handoff/SKILL.md.

## Pointers
- docs/PROFILE-USERNAMES.md; profile-username.js; public/profile-username.jsx; supabase/migrations/20261014022747_cl_profile_usernames.sql; e2e/profile-usernames.spec.js; username-*.log.
- docs/SEARCH-EXPANSION.md; CLAUDE-SEARCH-TASK.md; docs/CLAUDE-SEARCH-RESULTS.md; .local-artifacts/search-expansion/; ../chainlens-claude-search; HANDOFF_LEASES.json.
- docs/NAD-SEARCH.md; nad-resolver.js; test/nad-resolver.test.js; e2e/nad-search.spec.js; .local-artifacts/nad-search/; nad-final-{unit,e2e}.log.
- docs/LINKED-WALLET-LAYOUT.md; e2e/profile-linked-wallets.spec.js; .local-artifacts/linked-wallets/; linked-wallet-{final-unit,final-e2e,regression}.log.
- docs/NFT-PROFILE-PICTURES.md; .local-artifacts/chat-sizing/; .local-artifacts/nft-avatar/.
- public/index.html; public/profile-avatar.css; public/profile-social.css; e2e/chat-ui.spec.js; chat-sizing-{e2e,final-e2e,final-check,final-unit}.log.
- docs/PROFILE-SEARCH-CHAT.md; docs/PUBLIC-PROFILE-GALLERY.md.
- HANDOFF_ARCHIVE.md retains the previous full live board; HANDOFF_LOG.md retains milestone history.
