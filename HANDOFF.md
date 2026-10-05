# Handoff board — ChainLens
<!-- handoff v1. LIVE STATE ONLY: rewrite in place, keep under ~60 lines.
     History goes in HANDOFF_LOG.md. Machine fields above the first ## are managed by handoff.py. -->

owner: none
task: -
lease_until: -
repo: -
verify: npm run check && npm test
verified: no-git · 139 unit tests pass; syntax/precompile pass; 2 browser scenarios pass with final favicon scenario rerun passing; actual backend endpoint HTTP200/live/3000ms/no-store verified · 2026-10-05T19:10-03:00
head: no-git
updated: 2026-10-05T19:10-03:00 · codex

## Now
- ChainLens Market / New Listings implementation complete locally; wallet untouched.
- Server-only NEW_LISTINGS_KEY configured in ignored local .env. No deployment or commit.
- Added ws dependency, feed service/tests, Market UI/e2e, docs/NEW-LISTINGS.md.
- Syntax and precompile pass; 139 unit tests and 2 browser tests pass. Real backend endpoint HTTP 200/live/no-store with 3000ms delay; no event arrived during brief probe.
- Official favicon saved locally in public/new-listings-favicon.png and used in switcher; gitignore covers secrets, runtime/test artifacts, ephemeral .handoff.lock.

## Next
- Configure NEW_LISTINGS_KEY in production and deploy/restart only when authorized; verify live endpoint. Wallet work later per user.

## Traps
- Free feed contains exchange announcements, no price/history/contract data. Memory buffer clears on restart; reconnects can leave gaps.
- One socket per backend process; key permits only 2 egress IPs. Use shared ingest before scaling replicas.
- No .git found in this ChainLens folder. Magic Money Wallet has a separate active Claude lease; do not touch it.

## Skills
- agent-handoff: board/journal/lease; Codex C:/Users/balla/.codex/skills/agent-handoff/SKILL.md; Claude path unverified.
- architecture-review: server feed boundary and ws dependency; Codex C:/Users/balla/.codex/skills/architecture-review/SKILL.md.
- Fullstack Iteration, Playwright Testing, Visual Iteration: implementation/browser/screenshot validation; Codex skills root C:/Users/balla/.codex/skills.

## Pointers
- docs/NEW-LISTINGS.md; test/new-listings-service.test.js; e2e/new-listings.spec.js.
- test-results/new-listings-desktop.png and new-listings-mobile.png; new-listings-unit-run.txt.
