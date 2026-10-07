# Handoff board — ChainLens
<!-- handoff v1. LIVE STATE ONLY: rewrite in place, keep under ~60 lines.
     History goes in HANDOFF_LOG.md. Machine fields above the first ## are managed by handoff.py. -->

owner: none
task: -
lease_until: -
repo: -
verify: npm run check && npm test
verified: no-git · 179Node tests,7unique browser checks across runs,final collection test,syntax/precompile/diff; live Lil Sappys10/10decoded across3mosaics · 2026-10-06T20:58-03:00
head: no-git
updated: 2026-10-06T20:58-03:00 · codex

## Now
- Collection/viewer UI complete locally: Overview renders every NFT in consecutive4-item quilts/adaptive remainders; modern shared popup follows filtered gallery/Scanner order with arrows/keyboard/focus management. Actual Lil Sappys10/10 decoded across3Overview tiles; screenshots reviewed. docs/COLLECTION-VIEWER.md; no commit/deploy.
- Monad/Robinhood follow-up implemented locally:10-call spaced Monad RPC batches/selective alternate retry, exact-content JSON gateway fallback and missing-metadata tooltip.80 live records audited; selected22 initially unresolved ->7decoded locally (6Robinhood repairs+Nad recheck),15empty-URI/no-provider-art remain. See NFT coverage results follow-up; no commit/deploy.
- NFT image coverage implemented locally; see docs/NFT-IMAGE-COVERAGE-RESULTS.md. Cardano gateway/URI/CID/CBOR/classification/pagination fixes; shared6-slot displayed-image loader; bounded DNS-pinned JSON fetching, deferred EVM/Solana repair, Monad fallback integration and Retry artwork. No commit/push/deploy or wallet edits.
- Live Cardano adapter:62 stake assets ->52NFT records across4pages, all with candidates. Full local browser decoded52/52 (51Holdings+1Spam);7selected screenshot failures also7/7. Real adapter/media with mocked login, not production validation. Claude read-only audit corroborates gateway/CIP findings.
- Current checks:179Node tests,7unique collection/Profile/image/Scanner browser checks pass across runs; final collection focus/mobile test passes. Syntax/six-script precompile/diff pass. Actual Lil Sappys10/10decoded; prior EVM22:7decoded/15missing-metadata evidence retained. *.log ignored.
- Prior Profile/banner/favorites/spam/scanner cache/toolbar/Cardano image work is committed by user; screenshot confirms public improvement. Current Monad/Robinhood follow-up needs user release and production/embedded-browser QA.
- New Listings collector remains deployed to chainlens-search Worker; local Render proxy/browser tests passed. Public Render endpoint may still use old memory collector; previous feed release decision remains separate.

## Next
- User review Lil Sappys mosaic/viewer screenshots and commit/push frontend plus previous Monad/Robinhood follow-up when ready; verify deployed UI.

## Traps
- IPFS sponsored gateways retired direct fetch; old Cloudflare host failsDNS. Native sources nowBlockfrost/Pinata/Filebase, preserving working supplied gateways. node-fetch required for DNS-pinned document agents; native fetch ignores them.
- Image loader owns displayed DOM src; keep React src constant to avoid duplicate no-store gateway requests. Retry endpoints accept known canonical token identities only.
- Deploy new public/nft-session.js with index.html and profile-portfolio.jsx; Scanner shares the cache. Tokens/transactions still need calls. Failed sources can retry; Profile revalidates successful NFTs after five minutes when revisited or visible.
- Alchemy legacy floor currency is missing on Monad; require explicit currency outside known ETH networks. Never assume ETH/native blindly.
- Arweave redirects to its subdomains; bounded gateway allowlist is required. Alchemy Robinhood RPC host failed while public Robinhood RPC works.
- NFT provider traits can be dictionaries, serialized JSON, scalars or arrays with null entries; normalize before array methods or React rendering. Deploy public/nft-metadata.js with the frontend fix.
- Free feed contains exchange announcements, no price/history/contract data. Durable collector saves captured events; provider reconnects can still leave gaps.
- Cloudflare object owns one provider socket. Render proxy must not open another. Key permits only2egress IPs. Outbound sockets do not hibernate;30s alarms plus1min cron maintain/recover the object. Clear handshake AbortController deadline after upgrade or it closes the socket10s later.
- Git actual HEAD4a5794d/main (user NFT display fixes commit); board repo=- still reports no-git. Wallet has its own lease; unchanged during this task.
- Favorites require updated backend/Worker before clients; old sanitizers discard f/u. Live same-ID device sync needs deployment QA; no database migration needed.

## Skills
- New Listings collector -> cloudflare,durable-objects,workers-best-practices,wrangler,architecture-review | used: lifecycle/SQLite/reconnect/runtime-test and deployment guidance | Codex: C:/Users/balla/.codex/skills/<name>/SKILL.md | Claude: unknown.
- Shared profile preferences -> supabase:supabase | used: existing table/auth boundary and read-only connectivity check | source: Supabase plugin | Codex: C:/Users/balla/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md | Claude: unknown.
- agent-handoff: board/journal/lease; Codex C:/Users/balla/.codex/skills/agent-handoff/SKILL.md; Claude path unverified.
- architecture-review: server feed boundary and ws dependency; Codex C:/Users/balla/.codex/skills/architecture-review/SKILL.md.
- Fullstack Iteration, Playwright Testing, Visual Iteration: implementation/browser/screenshot validation; Codex skills root C:/Users/balla/.codex/skills.

## Pointers
- docs/COLLECTION-VIEWER.md;e2e/collection-viewer.spec.js;.local-artifacts/nft-coverage/lil-sappys-{mosaics,viewer-desktop,viewer-mobile}.png;collection-viewer-*.log.
- docs/NFT-IMAGE-COVERAGE-RESULTS.md;cardano-media.js;nft-metadata-document.js;nft-metadata-repair.js;public/nft-image.js;e2e/nft-image-coverage.spec.js; .local-artifacts/nft-coverage/cardano-all-browser.json and cardano-full-{desktop,mobile}.png.
- docs/NFT-IMAGE-COVERAGE-PLAN.md: current architecture, Cardano-first passes, source escalation, acceptance gates and official references.
- cloudflare-search-worker/src/new-listings.ts;test/new-listings.spec.ts;wrangler.jsonc;new-listings-proxy.js;test/new-listings-proxy.test.js;docs/NEW-LISTINGS.md;test-results/new-listings-{cloudflare-live.json,live-local.png}.
- Scanner toolbar: public/index.html; e2e/profile-favorites.spec.js; test-results/scanner-controls-{desktop,mobile}.png.
- public/nft-session.js; test/nft-session.test.js; e2e/scanner-cache.spec.js; test-results/scanner-profile-cache.png.
- docs/PROFILE-PORTFOLIO.md; public/profile-portfolio.{jsx,css}; sql/cl_profile_banner.sql; e2e/profile-portfolio.spec.js; test-results/profile-portfolio-{desktop,mobile,banner}.png.
- docs/PROFILE-NFT-FAVORITES.md; public/nft-favorites.jsx; e2e/profile-favorites.spec.js; test-results/profile-favorites-scanner.png.
- public/apphub.png; test-results/apphub-logo-desktop.png and apphub-logo-mobile.png.
- public/marketwatch.png; source ../Magic Money Wallet/logos and Banners/marketwatch.png (read only).
- docs/NEW-LISTINGS.md; test/new-listings-service.test.js; e2e/new-listings.spec.js.
- test-results/new-listings-desktop.png and new-listings-mobile.png; new-listings-unit-run.txt.
