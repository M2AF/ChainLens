# Handoff board — ChainLens
<!-- handoff v1. LIVE STATE ONLY: rewrite in place, keep under ~60 lines.
     History goes in HANDOFF_LOG.md. Machine fields above the first ## are managed by handoff.py. -->

owner: none
task: -
lease_until: -
repo: .
verify: npm run check && npm test
verified: e652796 · e652796 plus local split-results changes:271Node,syntax,13compiledJSX and11affected browser pass;desktop/mobile screenshots reviewed;no agent commit/deploy. · 2026-10-13T22:18-03:00
head: e652796 (main) dirty 8
updated: 2026-10-13T22:18-03:00 · codex

resources: ["search/ui"]

## Now
- Search expansion is in user commit e652796. Follow-up locally separates automatic Tokens and NFTs/collections results, retaining independent network selectors and transaction section. Natural suffix such as emonad on monad blockchain selects Monad in both.271Node/13compiledJSX/syntax and11affected browser checks pass; desktop/mobile screenshots reviewed. Source uncommitted; no agent commit/deploy/MM/DB change. Evidence .local-artifacts/search-expansion/separate-{unit,verified-e2e}.log; test-results/search-separate-{1440,390}.png.
- .nad search complete locally on user HEAD4cc9f0e: mainnet NNS resolver via existing ethers, normalized namehash, fixed public RPCs with timeout/fallback/60sec bounded cache. Search shows resolved address/Copy/Scan and reuses address; direct Scanner .nad dispatch uses nad route. Live criptoejesus.nad resolves01faf6df...5efe13; RPC chain143. Syntax/11JSX/234Node/10browser pass; desktop/mobile screenshots reviewed. Source/tests/docs uncommitted; no agent deploy/new SDK/key/backend DB changes.
- Linked-wallet owner UI is in user commit4cc9f0e: compact wallet-style rows, full wrapping addresses/exact Copy feedback, stacked Rename/Remove and inline primary action. Prior228Node/9browser checks and desktop/mobile screenshots pass; source preserved in this task.
- Chat sizing/overflow is in user commit4dd857d; current syntax/228Node/11JSX pass. 40px avatars,36px presence; contained NFT rotation; media/text fit.17 affected browser cases covered across runs; final width+unread2pass after startup allowance. Desktop/mobile/popout screenshots reviewed.
- NFT PFP work remains in scope of prior shared feature: cached searchable/scrollable spam-filtered picker, NFT-detail action, shared avatar_nft_key, animated NFT hexagons and circular uploads. Shared Supabase migration20261013012323 applied; existing pictures need NFT reselection once. App/Worker deployment and native runtime sync QA remain separate. Companion wallet final local gate exits0:2520unit/91browser+1history retry+1skip; no agent release/install.

## Next
- User review/commit split-results follow-up and deploy frontend when authorized.

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
- docs/SEARCH-EXPANSION.md; CLAUDE-SEARCH-TASK.md; docs/CLAUDE-SEARCH-RESULTS.md; .local-artifacts/search-expansion/; ../chainlens-claude-search; HANDOFF_LEASES.json.
- docs/NAD-SEARCH.md; nad-resolver.js; test/nad-resolver.test.js; e2e/nad-search.spec.js; .local-artifacts/nad-search/; nad-final-{unit,e2e}.log.
- docs/LINKED-WALLET-LAYOUT.md; e2e/profile-linked-wallets.spec.js; .local-artifacts/linked-wallets/; linked-wallet-{final-unit,final-e2e,regression}.log.
- docs/NFT-PROFILE-PICTURES.md; .local-artifacts/chat-sizing/; .local-artifacts/nft-avatar/.
- public/index.html; public/profile-avatar.css; public/profile-social.css; e2e/chat-ui.spec.js; chat-sizing-{e2e,final-e2e,final-check,final-unit}.log.
- docs/PROFILE-SEARCH-CHAT.md; docs/PUBLIC-PROFILE-GALLERY.md.
- HANDOFF_ARCHIVE.md retains the previous full live board; HANDOFF_LOG.md retains milestone history.
