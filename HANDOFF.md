# Handoff board — ChainLens
<!-- handoff v1. LIVE STATE ONLY: rewrite in place, keep under ~60 lines.
     History goes in HANDOFF_LOG.md. Machine fields above the first ## are managed by handoff.py. -->

owner: none
task: -
lease_until: -
repo: .
verify: npm run check && npm test
verified: 1faccb1 · npm check;193Node tests;14existing picker journeys and additional all-art legacy-profile override test pass. Art/material palettes fixed, no editor controls; docs picker locked; ordinary color/custom editing preserved. · 2026-10-10T22:11-03:00
head: 1faccb1 (main) dirty 6
updated: 2026-10-10T22:11-03:00 · codex

resources: -

## Now
- Art/material themes are fixed palettes locally: no edit controls, old profile recolors ignored; docs picker also locked. Ordinary colors/custom themes remain editable.193Node tests/npm check;14picker journeys plus legacy-profile test pass. docs/ART-THEME-PALETTE-LOCK.md; .art-lock-*.log. No commit/deploy.
- Emonad tarot theme complete locally, immediately above r3tards: original card backdrop/character, flat rose/vine/moon/star frame, muted purple/silver; smooth original brands, stock portfolio layout. docs/EMONAD-THEME.md; .local-artifacts/emonad/. Checks .emonad-*.log pass; no commit/deploy/install.
- Five approved natural material skins implemented locally: Brushed Metal, Leather, Velvet, Walnut and Royal Blue Silk; fixed palettes, shared generated raster surfaces, coordinated cards, smooth logos and seamless brand/portfolio summary. docs/NATURAL-MATERIAL-THEMES.md; .local-artifacts/materials/. No commit/deploy/install.
- Liquid Glass fixed-palette material skin added locally; no recolour. Shared scene/optical SVG, clear surfaces and transparent brand bars without divider; colourable Glass portfolio summary also seamless. Validation in .liquid-*.log; docs/LIQUID-GLASS.md. No commit/deploy/install.
- Palette finishes implemented locally Oct10: Glass (translucent frosted), Flat, Fine Grain, Soft Fade; independent local picker and Two-tone surfaces switch (default on; off matching, including Glass), original art suspension and preserved custom colour/profile rules. Glass clearer at22% tint with ambient light/reflections/strong rim; Soft Fade strengthened; wallet summary gradient removed per review. User rejected material patterns; future realistic material skins should have fixed natural palettes. docs/PALETTE-FINISHES.md; .local-artifacts/textures/. No commit/deploy/install.
- r3tards background refinement on user HEADf893eff: centered cover/no-repeat main and sidebar, matching source zoom/crop; portrait/landscape/mobile screenshots reviewed. Menu/Scanner positions preserved.192Node tests/check and r3tards full journey pass; layout rerun passes after correcting exact48px clearance assertion from strict-less-than to less-or-equal. No wallet edits/commit/deploy.
- r3tards scaling fixed locally on user HEAD93eb5d0: rectangular viewport-bounded menu, content-width Scanner columns/shrinkable fields and centered cover-scaled non-repeating collage per user source reference. Regression reproduced account/UTXO overflow before fix; all13theme-picker browser tests,192Node tests/check and6JSX precompiles pass. Screenshots reviewed at1080x1800,1080x720,900x900 and360x900 in .local-artifacts/r3tards/r3tards-scaling-*.png. No wallet edits/commit/deploy.
- r3tards collab complete locally: exact supplied PC.webp, source Schoolbell/Plex Mono fonts, white pill controls, purple panels and smooth neutral logos. 192Node/check,6JSX precompiles and all12picker browser tests pass; desktop/mobile screenshots reviewed including Market. docs/R3TARDS-THEME.md; .local-artifacts/r3tards/. No commit/deploy or wallet edits.
- Mallard Order and Sealuminati ported locally to ChainLens: Art themes picker, textures/fonts/frames/buttons, smooth gold logos and Search seal crest. 192Node tests, npm check and6JSX precompiles pass;12unique browser checks pass across runs, including both skins on desktop/mobile and lifecycle fallback. docs/ART-THEMES.md; .local-artifacts/art-themes/. User committed in4e6d391; live deployment unverified. Wallet unchanged.
- Inline New Listings charts implemented locally: official Coinbase/Upbit/Bithumb/MEXC/Binance spot catalog+candle adapters; exact provider listing can explicitly link a Coinbase reference market. PONS references and DARK native-exchange charts verified live.191Node tests, npm check and6JSX scripts pass;5unique browser checks pass across runs. Screenshots test-results/new-listings-charts-{desktop,mobile,live-desktop,live-mobile}.png; .local-artifacts/new-listings-charts-live.json. No commit/deploy; wallet/collector unchanged.
- ChainLens New Listings source token logos implemented locally: cached public-page artwork matched by event ID plus ordered symbols; multi-token circles and ticker fallback. Backend module new-listings-icons.js; wallet/Worker unchanged. 182Node tests, syntax and6JSX scripts pass;3market/listings browser checks pass. Live snapshot10events/4exact artwork matches; .local-artifacts/new-listings-icons-live.json. No commit/deploy.
- Two-item Overview tiles now stack vertically in half-width columns, including larger-collection remainders; compact pair controls preserve center artwork clicks. Desktop/mobile geometry and viewer regression checks in e2e/collection-viewer.spec.js; local screenshots test-results/collection-mosaics-{desktop,mobile}.png. No commit/deploy.
- Collection/viewer UI complete locally: Overview renders every NFT in consecutive4-item quilts/adaptive remainders; modern shared popup follows filtered gallery/Scanner order with arrows/keyboard/focus management. Actual Lil Sappys10/10 decoded across3Overview tiles; screenshots reviewed. docs/COLLECTION-VIEWER.md; no commit/deploy.
- Monad/Robinhood follow-up implemented locally:10-call spaced Monad RPC batches/selective alternate retry, exact-content JSON gateway fallback and missing-metadata tooltip.80 live records audited; selected22 initially unresolved ->7decoded locally (6Robinhood repairs+Nad recheck),15empty-URI/no-provider-art remain. See NFT coverage results follow-up; no commit/deploy.
- NFT image coverage implemented locally; see docs/NFT-IMAGE-COVERAGE-RESULTS.md. Cardano gateway/URI/CID/CBOR/classification/pagination fixes; shared6-slot displayed-image loader; bounded DNS-pinned JSON fetching, deferred EVM/Solana repair, Monad fallback integration and Retry artwork. No commit/push/deploy or wallet edits.
- Live Cardano adapter:62 stake assets ->52NFT records across4pages, all with candidates. Full local browser decoded52/52 (51Holdings+1Spam);7selected screenshot failures also7/7. Real adapter/media with mocked login, not production validation. Claude read-only audit corroborates gateway/CIP findings.
- Current checks:179Node tests,7unique collection/Profile/image/Scanner browser checks pass across runs; final collection focus/mobile test passes. Syntax/six-script precompile/diff pass. Actual Lil Sappys10/10decoded; prior EVM22:7decoded/15missing-metadata evidence retained. *.log ignored.
- Prior Profile/banner/favorites/spam/scanner cache/toolbar/Cardano image work is committed by user; screenshot confirms public improvement. Current Monad/Robinhood follow-up needs user release and production/embedded-browser QA.
- New Listings collector remains deployed to chainlens-search Worker; local Render proxy/browser tests passed. Public Render endpoint may still use old memory collector; previous feed release decision remains separate.

## Next
- User reviews fixed art palettes; no deployment authorized.

## Traps
- IPFS sponsored gateways retired direct fetch; old Cloudflare host failsDNS. Native sources nowBlockfrost/Pinata/Filebase, preserving working supplied gateways. node-fetch required for DNS-pinned document agents; native fetch ignores them.
- Image loader owns displayed DOM src; keep React src constant to avoid duplicate no-store gateway requests. Retry endpoints accept known canonical token identities only.
- Deploy new public/nft-session.js with index.html and profile-portfolio.jsx; Scanner shares the cache. Tokens/transactions still need calls. Failed sources can retry; Profile revalidates successful NFTs after five minutes when revisited or visible.
- Alchemy legacy floor currency is missing on Monad; require explicit currency outside known ETH networks. Never assume ETH/native blindly.
- Arweave redirects to its subdomains; bounded gateway allowlist is required. Alchemy Robinhood RPC host failed while public Robinhood RPC works.
- NFT provider traits can be dictionaries, serialized JSON, scalars or arrays with null entries; normalize before array methods or React rendering. Deploy public/nft-metadata.js with the frontend fix.
- Free feed contains exchange announcements, no price/history/contract data. Durable collector saves captured events; provider reconnects can still leave gaps.
- Cloudflare object owns one provider socket. Render proxy must not open another. Key permits only2egress IPs. Outbound sockets do not hibernate;30s alarms plus1min cron maintain/recover the object. Clear handshake AbortController deadline after upgrade or it closes the socket10s later.
- Actual git HEAD4e6d391 clean at r3tards task start; prior art-theme implementation is now in user commit. Board repo=. tracks the real checkout; older no-git entries were historical metadata. Wallet unchanged.
- Favorites require updated backend/Worker before clients; old sanitizers discard f/u. Live same-ID device sync needs deployment QA; no database migration needed.

## Skills
- Art theme port -> magic-money-art-themes | used: approved wallet assets, scoped material identity, smooth logos and responsive validation | Codex: C:/Users/balla/.codex/skills/magic-money-art-themes/SKILL.md | Claude: C:/Users/balla/.claude/skills/magic-money-art-themes/SKILL.md.
- New Listings collector -> cloudflare,durable-objects,workers-best-practices,wrangler,architecture-review | used: lifecycle/SQLite/reconnect/runtime-test and deployment guidance | Codex: C:/Users/balla/.codex/skills/<name>/SKILL.md | Claude: unknown.
- Shared profile preferences -> supabase:supabase | used: existing table/auth boundary and read-only connectivity check | source: Supabase plugin | Codex: C:/Users/balla/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md | Claude: unknown.
- agent-handoff: board/journal/lease; Codex C:/Users/balla/.codex/skills/agent-handoff/SKILL.md; Claude path unverified.
- architecture-review: server feed boundary and ws dependency; Codex C:/Users/balla/.codex/skills/architecture-review/SKILL.md.
- Fullstack Iteration, Playwright Testing, Visual Iteration: implementation/browser/screenshot validation; Codex skills root C:/Users/balla/.codex/skills.

## Pointers
- docs/EMONAD-THEME.md; .local-artifacts/emonad/; .emonad-*.log.
- docs/NATURAL-MATERIAL-THEMES.md; material CSS/assets and provenance.json; e2e/natural-materials.spec.*; .local-artifacts/materials/; .materials-*.log.
- docs/R3TARDS-THEME.md; public/themes/r3tards/; supplied C:/Users/balla/Downloads/PC.webp; .local-artifacts/r3tards/; r3tards-*.log.
- docs/ART-THEMES.md; public/art-themes.css; public/themes/; e2e/theme-picker.spec.js; .local-artifacts/art-themes/; art-themes-*.log.
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
