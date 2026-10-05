# Handoff board — ChainLens
<!-- handoff v1. LIVE STATE ONLY: rewrite in place, keep under ~60 lines.
     History goes in HANDOFF_LOG.md. Machine fields above the first ## are managed by handoff.py. -->

owner: none
task: -
lease_until: -
repo: -
verify: npm run check && npm test
verified: no-git · Homepage precompile passes; actual logo loaded in Chromium; desktop/mobile screenshots reviewed · 2026-10-05T19:36-03:00
head: no-git
updated: 2026-10-05T19:36-03:00 · codex

## Now
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
- Deploy local ChainLens App Hub/Market Watch logos and feed diagnostics when authorized; wallet remains deferred.

## Traps
- Free feed contains exchange announcements, no price/history/contract data. Memory buffer clears on restart; reconnects can leave gaps.
- One socket per backend process; key permits only 2 egress IPs. Use shared ingest before scaling replicas.
- No .git found in this ChainLens folder. Magic Money Wallet has a separate active Claude lease; do not touch it.

## Skills
- agent-handoff: board/journal/lease; Codex C:/Users/balla/.codex/skills/agent-handoff/SKILL.md; Claude path unverified.
- architecture-review: server feed boundary and ws dependency; Codex C:/Users/balla/.codex/skills/architecture-review/SKILL.md.
- Fullstack Iteration, Playwright Testing, Visual Iteration: implementation/browser/screenshot validation; Codex skills root C:/Users/balla/.codex/skills.

## Pointers
- public/apphub.png; test-results/apphub-logo-desktop.png and apphub-logo-mobile.png.
- public/marketwatch.png; source ../Magic Money Wallet/logos and Banners/marketwatch.png (read only).
- docs/NEW-LISTINGS.md; test/new-listings-service.test.js; e2e/new-listings.spec.js.
- test-results/new-listings-desktop.png and new-listings-mobile.png; new-listings-unit-run.txt.
