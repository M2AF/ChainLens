# Handoff board — ChainLens
<!-- handoff v1. LIVE STATE ONLY: rewrite in place, keep under ~60 lines.
     History goes in HANDOFF_LOG.md. Machine fields above the first ## are managed by handoff.py. -->

owner: none
task: -
lease_until: -
repo: .
verify: npm run check && npm test
verified: 5cbf5e8 · Base5cbf5e8 plus linked-wallet UI: syntax,11precompiled JSX assets,228Node and9 affected browser cases pass. Focused final journey exact clipboard8chains/stacked RenameRemove/editSaveCancel/primary/remove and1920/1024/768/390 no overflow. Final desktop/mobile screenshots reviewed .local-artifacts/linked-wallets; logs linked-wallet-final-unit/final-e2e/regression. No backend/schema/MagicMoney edit/commit/deploy. · 2026-10-13T01:19-03:00
head: 5cbf5e8 (main) dirty 4
updated: 2026-10-13T01:19-03:00 · codex

resources: -

## Now
- Linked-wallet owner UI complete locally on user base5cbf5e8: compact wallet-style rows, full wrapping addresses/exact Copy feedback, persistent stacked Rename/Remove and inline primary action. public/index.html + profile-portfolio.css; new browser journey verifies clipboard/edit/primary/remove/1920/1024/768/390 fit. Syntax/11JSX/228Node/9 affected browser cases pass; desktop/mobile screenshots reviewed. No backend/wallet app change or deployment; source and notes uncommitted.
- Chat sizing/overflow is in user commit4dd857d; current syntax/228Node/11JSX pass. 40px avatars,36px presence; contained NFT rotation; media/text fit.17 affected browser cases covered across runs; final width+unread2pass after startup allowance. Desktop/mobile/popout screenshots reviewed.
- NFT PFP work remains in scope of prior shared feature: cached searchable/scrollable spam-filtered picker, NFT-detail action, shared avatar_nft_key, animated NFT hexagons and circular uploads. Shared Supabase migration20261013012323 applied; existing pictures need NFT reselection once. App/Worker deployment and native runtime sync QA remain separate. Companion wallet final local gate exits0:2520unit/91browser+1history retry+1skip; no agent release/install.

## Next
- User review/commit/deploy linked-wallet UI when desired. See docs/LINKED-WALLET-LAYOUT.md and .local-artifacts/linked-wallets/.

## Traps
- Only the lease owner edits shared code; preserve dirty work. No commit/push/deploy/install/sign/broadcast without user authorization.
- clip-path alone does not contain the animated NFT pseudo-element for scroll sizing: retain overflow:hidden on the avatar. Reproduced9px right-edge feed overflow before fix.
- Native Android/iOS runtime and production profile sync are separate from local browser/TypeScript/build results.
- Existing NFT source cannot be inferred from image URL; uploaded photos remain circular, and legacy pictures need explicit NFT reselection.
- Public profile allowlist omits email/provider/social credentials; wallet visibility is user-controlled. Favorites expose only active mainnet favorites, never tombstones/filter documents. Browser database grants remain revoked/RLS enabled.
- Deploy NFT-session/index/profile scripts together; Scanner shares the profile cache. NFT provider metadata needs normalized traits and bounded URI/DNS fetching.
- Full older theme/media/provider guardrails are retained in HANDOFF_ARCHIVE.md (snapshot2026-10-12); read them before touching those systems.

## Skills
- Chat UI -> Fullstack Iteration / Visual Iteration / Playwright Testing | used: source tracing, before/after overflow regression, responsive browser checks and screenshots | Codex: C:/Users/balla/.codex/skills/{fullstack-iteration,visual-Iteration,playwright-testing}/SKILL.md | Claude: resolve local catalog.
- Shared project -> agent-handoff | used: lease, checkpoints, evidence and archived live-board history | Codex: C:/Users/balla/.codex/skills/agent-handoff/SKILL.md | Claude: C:/Users/balla/.claude/skills/agent-handoff/SKILL.md.

## Pointers
- docs/LINKED-WALLET-LAYOUT.md; e2e/profile-linked-wallets.spec.js; .local-artifacts/linked-wallets/; linked-wallet-{final-unit,final-e2e,regression}.log.
- docs/NFT-PROFILE-PICTURES.md; .local-artifacts/chat-sizing/; .local-artifacts/nft-avatar/.
- public/index.html; public/profile-avatar.css; public/profile-social.css; e2e/chat-ui.spec.js; chat-sizing-{e2e,final-e2e,final-check,final-unit}.log.
- docs/PROFILE-SEARCH-CHAT.md; docs/PUBLIC-PROFILE-GALLERY.md.
- HANDOFF_ARCHIVE.md retains the previous full live board; HANDOFF_LOG.md retains milestone history.
