# Profile search and Messenger page

Implemented locally on 2026-10-12. Frontend/backend deployment is still pending.

Search accepts an exact ChainLens UUID or an HTTPS profile link on
`chainlensnft.info` / `www.chainlensnft.info`. It shows the profile result before
Featured Apps, with loading, missing-account, and unavailable states. These
identity searches do not send the ID to the external web-search provider.

Public profile routes use `/<uuid>` and support refresh and browser history.
`GET /api/profiles/:id` is rate-limited and returns only `id`, `display_name`,
`avatar_url`, and `banner_url`. Account email, provider identity, linked wallets,
linked social accounts, holdings, and saved preferences are omitted. Public
wallet/holding visibility settings are deferred; these fields are not included.

Clicking a name in messages, the friends list, requests, or a public profile
opens the same menu: View Profile, Copy ID, Copy Profile Link, and the appropriate
friendship actions. Accepted friends also have Message. Pending requests support
Accept/Decline or Cancel. Own profiles do not offer friendship actions. Menus
render outside scroll panels to avoid clipping; Escape and arrow keys work.

`/chat` is the default sidebar destination. The left panel contains World Chat,
current participants, friends and requests. The right panel displays World Chat
or an accepted friend's conversation. On mobile, People toggles the panel.
Pop out chat returns to the preceding app page; Open chat page restores the full
layout. A single mounted component retains the selected conversation, separate
conversation drafts, and scroll position between modes. Pop-out keeps the
existing drag, pin, unread/read-cursor, message deletion, GIF and link rules.

## Presence

Eligible accounts send authenticated heartbeats every 20 seconds while the site
is visible. Presence expires after 75 seconds without a heartbeat. In World Chat
requires an open chat showing the world conversation. Hidden/closed browser
sessions are removed or expire; one tab closing does not mark another offline.
Only accepted friends and current World Chat participants appear in the presence
response. When presence fails, the UI says Status/Presence unavailable rather
than claiming offline.

`sql/cl_chat_presence.sql` was applied to the configured Supabase project
`vxrhosrktbknogyeyewy`. RLS is enabled and anon/authenticated privileges revoked;
only the backend service role has access. Expired crash-session rows may be
removed with the housekeeping query in that file; they never count as online.

## Approved database access fix

The Supabase advisor exposed existing RLS-disabled account tables with broad
anon/authenticated grants. The user explicitly approved the prepared
`sql/cl_account_access_hardening.sql`. It was applied to `cl_users`, `cl_wallets`,
and `cl_linked_accounts`. Both inspected ChainLens Express and Magic Money
Worker code use backend service-role access. Privilege checks confirm RLS enabled,
browser access revoked, service-role access retained; a service-role transaction
reads the supplied profile and its 9 wallet/2 social links. The advisor now has
no RLS-disabled errors; its no-policy INFO entries are expected for backend-only
tables using ChainLens JWTs.

Local `.env` SUPABASE_SERVICE_KEY is rejected as `Unregistered API key` by the
configured Supabase project. It was not changed. Local real HTTP profile requests
therefore return 503; connector database checks and fixture-backed UI/API tests
must not be described as live authenticated frontend integration. Render's own
deployment credentials need normal-path verification after release.

## Files and validation

Backend: `profile-social-service.js`, mounted from `backend-server.js`.
Frontend: `public/profile-id.js`, `public/profile-social.{jsx,css}`, updates to
`public/index.html` and `public/search-page.jsx`.
Tests: `test/profile-social.test.js`, `e2e/profile-social.spec.js`, updated
`e2e/chat-ui.spec.js`, `e2e/sidebar-navigation.spec.js`, and
`e2e/primary-tab-spacing.spec.js` (selector recognizes the current profile layout).
SQL: the two files above. This document and `HANDOFF.md` / `HANDOFF_LOG.md` record
the final state. No wallet source changes, commits, or app deployment.

Verification commands: `npm run check`, `npm test`, seven-script homepage
precompilation, and Playwright profile-social/chat-ui/sidebar-navigation/
primary-tab-spacing journeys. Run logs use `.social-*.log`; screenshots are
copied to `.local-artifacts/profile-social/` after final visual review.

Final result: syntax checks, 211 Node tests, seven JSX scripts, and 16 unique
browser cases pass across `.social-regression.log` (eight existing chat/sidebar
cases plus five initial social cases) and `.social-final-journeys.log` (all seven
final social cases plus the corrected spacing case). The initial spacing failure
was a stale selector, corrected and re-run successfully. Desktop/mobile chat,
pop-out, and public profile screenshots were visually reviewed. Presence insert,
active query, expiry exclusion, and deletion were exercised under service_role in
rolled-back database transactions; no test session remains.
