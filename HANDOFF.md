# Handoff board — ChainLens
<!-- handoff v1. LIVE STATE ONLY: rewrite in place, keep under ~60 lines.
     History goes in HANDOFF_LOG.md. Machine fields above the first ## are managed by handoff.py. -->

owner: none
task: -
lease_until: -
repo: -
verify: npm run check && npm test
verified: no-git · Worker typecheck,11/11runtime tests,dry-run;backend check164/164;Playwright2/2desktop/mobile;live local browser->backend->Cloudflare HTTP200/storage persistent,no page errors · 2026-10-06T13:58-03:00
head: no-git
updated: 2026-10-06T13:59-03:00 · codex

## Now
- Shared New Listings collector deployed to existing chainlens-search Worker, version82426527-ee8d-4ecb-ab55-8256e44b2e7f. READY/live and30s watchdog verified remotely;200listings stored in durable SQLite. No event arrived during QA. ChainLens local backend/browser uses Worker successfully; public Render endpoint still uses old memory collector. Awaiting user's choice on committing/pushing only feed changes; no commit/push yet.
- Banner text lowered locally: title and multichain caption bottom-aligned beside avatar,16px desktop/12px mobile inset. Avatar/ID positions retained. Existing Profile browser flow passes20.8s; desktop/mobile screenshots reviewed. CSS-only change ready for user deployment.
- REDACTED regression fixed locally: live Robinhood endpoint returned correct distinct #1/#2/#8/#9 art on five reads, while screenshot showed stale duplicate images. Last-good server repair cache survives transient RPC failure; Profile revalidates completed NFT cache after five minutes on return/focus/visible timer. 162 unit tests,4 profile/scanner browser tests, npm run check pass. No deployment.
- Scanner toolbar complete locally: restored Grid/List switch at right, asset tabs centered, Spam left. Mobile uses centered second row for tabs. Browser check passes including keyboard toggle/grid-list layout; desktop/mobile screenshots reviewed. Frontend precompile passes.
- Scanner cache/loading fix complete locally: shared per-account wallet/chain NFT cache with all-page reuse and progressive results; bounded requests and90-second scan deadline.160 unit tests and5 browser checks pass; unrelated-wallet isolation rerun passes. Screenshot reviewed. No backend changes.
- Banner identity refinement complete locally: title restored to previous Space Grotesk font; ID-copy moved outside banner above tabs.150px desktop/96px mobile avatar and modern sidebar actions retained. Desktop/mobile screenshots reviewed; homepage precompile passes.
- User confirms changes now work live after pushing their commit; screenshot shows uploaded banner, per-NFT spam buttons, Spam tab and correct REDACTED artwork,817 NFTs across13 chains. User confirmation, not an independent production audit.
- Profile spam/image/Monad fixes complete locally:156unit tests,6browser checks,syntax and6-script precompile pass. Fixtures verify spam sync/restoration, banner crop/save, image fallback and retained artwork.
- Banner production schema fixed: cl_profile_banner applied to configured Supabase project, nullable text verified and PostgREST reload requested. No user profile/banner rows changed; uploaded banner visible in user production screenshot.
- Live local backend returns53 Monad NFTs for linked wallet. REDACTED contract metadata repair returns correct #1/#2/#8/#9 artwork; original #51 remains correct. Real-data preview screenshots reviewed.
- New alternate CDN/original/IPFS image sources used by Profile/Scanner/details; bounded content-addressed metadata repair preserves existing art on failure. Monad Alchemy-first with cursor-safe Moralis fallback.
- Floor ordering: favorites pinned then descending verified floor USD; unknown floors last. Legacy uncurrencied floors converted only on known ETH networks after live Monad preview exposed wrong ETH assumption.
- Profile compact account/banner/mosaic/session cache and shared ChainLens-ID favorites remain implemented locally. Frontend metadata normalization prevents dictionary-trait render crash.
- Market/New Listings favicon and Market Watch/App Hub logos retained. Cloudflare now owns persistent feed collection; Render requires prepared proxy deployment. Provider free socket never replays history.
- User pushed/deployed changes and confirms success; Codex performed no commit/deployment. Wallet source only read during implementation; wallet lease untouched.

## Next
- On user approval, stage feed-only changes including selective public/index.html listing copy hunks, commit/push main, and verify Render public endpoint reports cloudflare-sqlite. Otherwise user pushes prepared changes. Worker is already collecting.

## Traps
- Deploy new public/nft-session.js with index.html and profile-portfolio.jsx; Scanner shares the cache. Tokens/transactions still need calls. Failed sources can retry; Profile revalidates successful NFTs after five minutes when revisited or visible.
- Alchemy legacy floor currency is missing on Monad; require explicit currency outside known ETH networks. Never assume ETH/native blindly.
- Arweave redirects to its subdomains; bounded gateway allowlist is required. Alchemy Robinhood RPC host failed while public Robinhood RPC works.
- NFT provider traits can be dictionaries, serialized JSON, scalars or arrays with null entries; normalize before array methods or React rendering. Deploy public/nft-metadata.js with the frontend fix.
- Free feed contains exchange announcements, no price/history/contract data. Durable collector saves captured events; provider reconnects can still leave gaps.
- Cloudflare object owns one provider socket. Render proxy must not open another. Key permits only2egress IPs. Outbound sockets do not hibernate;30s alarms plus1min cron maintain/recover the object. Clear handshake AbortController deadline after upgrade or it closes the socket10s later.
- Git is now present: ChainLens actual HEAD55cb316/main,origin M2AF/ChainLens; board repo=- still reports no-git. Wallet has its own lease; unchanged during this task.
- Favorites require updated backend/Worker before clients; old sanitizers discard f/u. Live same-ID device sync needs deployment QA; no database migration needed.

## Skills
- New Listings collector -> cloudflare,durable-objects,workers-best-practices,wrangler,architecture-review | used: lifecycle/SQLite/reconnect/runtime-test and deployment guidance | Codex: C:/Users/balla/.codex/skills/<name>/SKILL.md | Claude: unknown.
- Shared profile preferences -> supabase:supabase | used: existing table/auth boundary and read-only connectivity check | source: Supabase plugin | Codex: C:/Users/balla/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md | Claude: unknown.
- agent-handoff: board/journal/lease; Codex C:/Users/balla/.codex/skills/agent-handoff/SKILL.md; Claude path unverified.
- architecture-review: server feed boundary and ws dependency; Codex C:/Users/balla/.codex/skills/architecture-review/SKILL.md.
- Fullstack Iteration, Playwright Testing, Visual Iteration: implementation/browser/screenshot validation; Codex skills root C:/Users/balla/.codex/skills.

## Pointers
- cloudflare-search-worker/src/new-listings.ts;test/new-listings.spec.ts;wrangler.jsonc;new-listings-proxy.js;test/new-listings-proxy.test.js;docs/NEW-LISTINGS.md;test-results/new-listings-{cloudflare-live.json,live-local.png}.
- Scanner toolbar: public/index.html; e2e/profile-favorites.spec.js; test-results/scanner-controls-{desktop,mobile}.png.
- public/nft-session.js; test/nft-session.test.js; e2e/scanner-cache.spec.js; test-results/scanner-profile-cache.png.
- docs/PROFILE-PORTFOLIO.md; public/profile-portfolio.{jsx,css}; sql/cl_profile_banner.sql; e2e/profile-portfolio.spec.js; test-results/profile-portfolio-{desktop,mobile,banner}.png.
- docs/PROFILE-NFT-FAVORITES.md; public/nft-favorites.jsx; e2e/profile-favorites.spec.js; test-results/profile-favorites-scanner.png.
- public/apphub.png; test-results/apphub-logo-desktop.png and apphub-logo-mobile.png.
- public/marketwatch.png; source ../Magic Money Wallet/logos and Banners/marketwatch.png (read only).
- docs/NEW-LISTINGS.md; test/new-listings-service.test.js; e2e/new-listings.spec.js.
- test-results/new-listings-desktop.png and new-listings-mobile.png; new-listings-unit-run.txt.
