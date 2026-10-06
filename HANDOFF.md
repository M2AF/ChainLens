# Handoff board — ChainLens
<!-- handoff v1. LIVE STATE ONLY: rewrite in place, keep under ~60 lines.
     History goes in HANDOFF_LOG.md. Machine fields above the first ## are managed by handoff.py. -->

owner: none
task: -
lease_until: -
repo: -
verify: npm run check && npm test
verified: no-git · 160unit tests;5browser checks; Scanner isolation rerun;syntax/precompile6scripts · 2026-10-06T03:06-03:00
head: no-git
updated: 2026-10-06T03:06-03:00 · codex

## Now
- Scanner cache/loading fix complete locally: shared per-account wallet/chain NFT cache with all-page reuse and progressive results; bounded requests and90-second scan deadline.160 unit tests and5 browser checks pass; unrelated-wallet isolation rerun passes. Screenshot reviewed. No backend changes.
- Banner identity refinement complete locally: title restored to previous Space Grotesk font; ID-copy moved outside banner above tabs.150px desktop/96px mobile avatar and modern sidebar actions retained. Desktop/mobile screenshots reviewed; homepage precompile passes.
- User confirms changes now work live after pushing their commit; screenshot shows uploaded banner, per-NFT spam buttons, Spam tab and correct REDACTED artwork,817 NFTs across13 chains. User confirmation, not an independent production audit.
- Profile spam/image/Monad fixes complete locally:156unit tests,6browser checks,syntax and6-script precompile pass. Fixtures verify spam sync/restoration, banner crop/save, image fallback and retained artwork.
- Banner production schema fixed: cl_profile_banner applied to configured Supabase project, nullable text verified and PostgREST reload requested. No user profile/banner rows changed; uploaded banner visible in user production screenshot.
- Live local backend returns53 Monad NFTs for linked wallet. REDACTED contract metadata repair returns correct #1/#2/#8/#9 artwork; original #51 remains correct. Real-data preview screenshots reviewed.
- New alternate CDN/original/IPFS image sources used by Profile/Scanner/details; bounded content-addressed metadata repair preserves existing art on failure. Monad Alchemy-first with cursor-safe Moralis fallback.
- Floor ordering: favorites pinned then descending verified floor USD; unknown floors last. Legacy uncurrencied floors converted only on known ETH networks after live Monad preview exposed wrong ETH assumption.
- Profile compact account/banner/mosaic/session cache and shared ChainLens-ID favorites remain implemented locally. Frontend metadata normalization prevents dictionary-trait render crash.
- Market/New Listings favicon and Market Watch/App Hub logos implemented locally. Production feed configured/live; free socket never replays history and restarts clear its memory buffer.
- User pushed/deployed changes and confirms success; Codex performed no commit/deployment. Wallet source only read during implementation; wallet lease untouched.

## Next
- User pushes/deploys public/index.html,public/profile-portfolio.jsx and NEW public/nft-session.js together. Tokens/transactions still request separately; cached NFTs render immediately.

## Traps
- Deploy new public/nft-session.js with index.html and profile-portfolio.jsx; Scanner uses the same cache. Tokens/transactions still need calls. Failed sources can retry; successful NFTs persist until refresh/logout.
- Alchemy legacy floor currency is missing on Monad; require explicit currency outside known ETH networks. Never assume ETH/native blindly.
- Arweave redirects to its subdomains; bounded gateway allowlist is required. Alchemy Robinhood RPC host failed while public Robinhood RPC works.
- NFT provider traits can be dictionaries, serialized JSON, scalars or arrays with null entries; normalize before array methods or React rendering. Deploy public/nft-metadata.js with the frontend fix.
- Free feed contains exchange announcements, no price/history/contract data. Memory buffer clears on restart; reconnects can leave gaps.
- One socket per backend process; key permits only 2 egress IPs. Use shared ingest before scaling replicas.
- No .git found in this ChainLens folder. Wallet has its own lease; always check ownership before shared edits.
- Favorites require updated backend/Worker before clients; old sanitizers discard f/u. Live same-ID device sync needs deployment QA; no database migration needed.

## Skills
- Shared profile preferences -> supabase:supabase | used: existing table/auth boundary and read-only connectivity check | source: Supabase plugin | Codex: C:/Users/balla/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md | Claude: unknown.
- agent-handoff: board/journal/lease; Codex C:/Users/balla/.codex/skills/agent-handoff/SKILL.md; Claude path unverified.
- architecture-review: server feed boundary and ws dependency; Codex C:/Users/balla/.codex/skills/architecture-review/SKILL.md.
- Fullstack Iteration, Playwright Testing, Visual Iteration: implementation/browser/screenshot validation; Codex skills root C:/Users/balla/.codex/skills.

## Pointers
- public/nft-session.js; test/nft-session.test.js; e2e/scanner-cache.spec.js; test-results/scanner-profile-cache.png.
- docs/PROFILE-PORTFOLIO.md; public/profile-portfolio.{jsx,css}; sql/cl_profile_banner.sql; e2e/profile-portfolio.spec.js; test-results/profile-portfolio-{desktop,mobile,banner}.png.
- docs/PROFILE-NFT-FAVORITES.md; public/nft-favorites.jsx; e2e/profile-favorites.spec.js; test-results/profile-favorites-scanner.png.
- public/apphub.png; test-results/apphub-logo-desktop.png and apphub-logo-mobile.png.
- public/marketwatch.png; source ../Magic Money Wallet/logos and Banners/marketwatch.png (read only).
- docs/NEW-LISTINGS.md; test/new-listings-service.test.js; e2e/new-listings.spec.js.
- test-results/new-listings-desktop.png and new-listings-mobile.png; new-listings-unit-run.txt.
