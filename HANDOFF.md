# Handoff board — ChainLens
<!-- handoff v1. LIVE STATE ONLY: rewrite in place, keep under ~60 lines.
     History goes in HANDOFF_LOG.md. Machine fields above the first ## are managed by handoff.py. -->

owner: none
task: -
lease_until: -
repo: -
verify: npm run check && npm test
verified: no-git · 148 unit tests;5 browser checks; syntax and6-script precompile pass; live floor adapter100/96/96 · 2026-10-06T01:13-03:00
head: no-git
updated: 2026-10-06T01:13-03:00 · codex

## Now
- Profile floor sorting implemented locally: Alchemy collection floors converted to USD, favorites pinned then descending floor in Overview/Holdings/Favorites; unknowns last and tile price labels. 148 unit tests,5 browser checks,syntax/precompile pass; desktop/mobile screenshots reviewed. Live Ethereum adapter probe:100 NFTs,96 reported/converted floors; no deployment.
- Production Profile render crash from non-array traits fixed locally: public/nft-metadata.js normalizes dictionaries/arrays/JSON/scalars for categories and NFT details;145unit tests,5browser checks and6script precompile pass. Mixed-metadata screenshots reviewed; fix awaits deployment.
- Profile portfolio redesign implemented locally: compact left account disclosures,3:1banner,Overview/Holdings/Favorites mosaic, all-linked-wallet session cache and background previews; scanner state independent and Profile stays mounted through navigation.
- 143 unit tests, syntax/precompile6scripts and5browser checks pass; profile test repeated after compact account styling and expanded-panel assertions (pass). Desktop/mobile/expanded account screenshots reviewed. Banner SQL prepared, not applied; existing local DB read rejected (Unregistered API key).
- Shared ChainLens-ID NFT favorites complete locally in website and Magic Money: profile-scoped favorites/unfavorite tombstones, offline retry, wallet legacy migration and account/network isolation. Stars pin NFTs; existing sorts remain within groups.
- 140 unit tests, syntax/precompile, scanner-star and real wallet+website hook browser checks pass. Existing local DB credential returned Unregistered API key; no live DB writes, commit or deployment.
- App Hub text heading replaced locally with supplied public/apphub.png logo; unchanged source artwork, responsive padding clip and light-mode inversion. Desktop/mobile screenshots reviewed; homepage precompile passes.
- User clarified missed-new-listing report was a misread; no confirmed ingestion defect. MON spot timestamp18:26 Halifax predates key-config verification19:14.
- Added local sanitized connection/receive/filter counters and explicit free-feed empty state with connection time. 139 unit tests and homepage compilation pass; existing desktop/mobile feed test passes.
- Production endpoint verified HTTP200/live/3000ms with events=[] and updatedAt=null. Key now configured; no listing stored in current process.
- Provider FAQ confirms sockets never replay; free key cannot fetch history. Website historical rows do not seed ChainLens. Production homepage still lacks local logo update.
- Market Watch h2 now uses user's public/marketwatch.png logo, copied unchanged; responsive CSS clips transparent padding and inverts only in light mode for contrast.
- ChainLens Market / New Listings implementation complete locally; wallet untouched.
- Server-only NEW_LISTINGS_KEY configured in ignored local .env. No deployment or commit.
- Added ws dependency, feed service/tests, Market UI/e2e, docs/NEW-LISTINGS.md.
- Syntax and precompile pass; 139 unit tests and 2 browser tests pass. Real backend endpoint HTTP 200/live/no-store with 3000ms delay; no event arrived during brief probe.
- Official favicon saved locally in public/new-listings-favicon.png and used in switcher; gitignore covers secrets, runtime/test artifacts, ephemeral .handoff.lock.

## Next
- Deploy floor sorting and previous metadata crash fix; refresh Profile.

## Traps
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
- docs/PROFILE-PORTFOLIO.md; public/profile-portfolio.{jsx,css}; sql/cl_profile_banner.sql; e2e/profile-portfolio.spec.js; test-results/profile-portfolio-{desktop,mobile,banner}.png.
- docs/PROFILE-NFT-FAVORITES.md; public/nft-favorites.jsx; e2e/profile-favorites.spec.js; test-results/profile-favorites-scanner.png.
- public/apphub.png; test-results/apphub-logo-desktop.png and apphub-logo-mobile.png.
- public/marketwatch.png; source ../Magic Money Wallet/logos and Banners/marketwatch.png (read only).
- docs/NEW-LISTINGS.md; test/new-listings-service.test.js; e2e/new-listings.spec.js.
- test-results/new-listings-desktop.png and new-listings-mobile.png; new-listings-unit-run.txt.
