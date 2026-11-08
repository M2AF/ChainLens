# The Nexus social integration

## Account-only browser flow (0.4.1)

The launcher account button and consent sign-in link open `/nexus-account.html`, not the full ChainLens homepage/Profile application. This standalone page loads only its two stylesheets, its own script, saved PFP media and `/api/nexus/account`. It never imports the portfolio, wallet, NFT-inventory, swap or blockchain-provider bundles. Google/Discord use their existing OAuth registration with a fixed `nexus-desktop` client hint stored in server-side OAuth state. Nexus callbacks, cancellations and expired/replayed Nexus states return to this page; a successful web JWT is returned in the fragment, removed from the address bar immediately, and retained only in first-party browser storage. Existing web and social-link callbacks keep their normal destination. No arbitrary return URL is accepted.

`GET /api/nexus/account` requires the existing browser account credential and projects only id, saved display name, username, avatar URL and saved avatar-selection metadata. The Nexus identity database lookup selects only these cl_users columns. It does not read holdings, scan collections or call Alchemy, Helius, RPCs or other blockchain APIs. Existing messenger eligibility checks are database checks; this work does not change messaging permissions. The launcher renders saved HTTPS PFP media (including Cloudinary) and inline raster uploads; it performs no NFT ownership lookup to display an existing picture.

Validation: 300 backend tests and 20 desktop tests pass. Real OAuth route handlers are tested with stubbed Google/Discord responses to verify fixed callback destinations and only provider-auth requests. The native Electron fixture verifies the standalone account page's complete first-party request allowlist, no portfolio/blockchain requests, loaded Cloudinary-style and uploaded avatars, username refresh, draft retention and QWERTY controller chat typing without sending. No real messages or friend requests were sent. Original release a259912 is live and the user completed consent; the account-page follow-up is a separate scoped release.

The Nexus can connect its friends/chat panel to an existing ChainLens account. Native sign-in uses the default browser, explicit first-party consent, S256 PKCE and a random ephemeral IPv4 loopback callback. No ChainLens web JWT, provider credential or wallet material is given to the desktop app. Production activation was authorized by the user on November 7, 2026; end-to-end messaging evidence uses isolated fictitious accounts.

## Scope and files

- `nexus-sso.js`: client `nexus-desktop`, seven-day opaque social credential, one-use 60-second authorization codes, strict loopback redirects, narrow chat-route adapter and GIPHY proxy. Server restarts invalidate pending authorization codes, while completed sessions survive in the database.
- `backend-server.js`: mounts the bridge and lets only authenticated Nexus social requests reuse existing friends, messages and presence handlers. General account/wallet routes retain their existing authentication.
- `public/nexus-connect.html` and `.js`: first-party consent using the existing ChainLens browser session and `duo-connect.css`.
- `supabase/migrations/20261108025403_nexus_social_sessions.sql`: private `cl_nexus_sessions` table. Stores token SHA-256 hashes, account UUID, client and expiry; RLS enabled, no anon/authenticated grants, service-role SELECT/INSERT/DELETE only. Account deletion cascades. Expired rows are rejected; routine database maintenance may prune them.
- `test/nexus-sso.test.js` and `package.json`: bridge regressions and syntax checks.
- Desktop implementation: `C:/Users/balla/Desktop/The Nexus/lib/chainlens-client.js`, `main.js`, `preload.js`, `app/social.js`, `app/social.css`, `app/index.html` and branded assets. No added runtime dependencies.

## API and restrictions

`GET /api/nexus/config` advertises availability only when the private table is accessible. `/auth/nexus` opens consent. The existing authenticated browser approves via `POST /api/nexus/authorize`; the desktop exchanges the code at `POST /api/nexus/token`. The opaque credential authorizes `/api/nexus/me`, `/api/nexus/logout`, `/api/nexus/gifs` and the explicitly allowlisted `/api/nexus/social/*` friends/messages/presence/read routes. It does not authorize world chat, profiles, account edits, holdings, wallets, trading or game saves. Existing friendship, blocking, message limits and chat eligibility still apply.

The desktop pins `https://www.chainlensnft.info`, validates advertised endpoints and callback state/host/path, keeps the credential in the Electron main process and encrypts it with Windows safeStorage. The renderer receives public account/status data only. Profile export excludes the credential. Offline sign-out removes the local credential; unsuccessful server revocation leaves it valid only until its original expiry.

GIF search/trending uses the backend's existing `GIPHY_API_KEY` when configured. The key stays server-side. Without it the UI still accepts a direct HTTPS GIPHY GIF/WebP link. Selecting media creates a preview; sending requires a separate action. Chat eligibility remains the current verified non-watch wallet plus linked Google/Discord requirement; sign-in alone does not bypass it.

## Validation and activation

Local checks: 295 backend tests, 19 desktop tests, syntax checks, actual SQL migration in ephemeral PostgreSQL (PGlite), and native Electron consent/login/friends/messages/emoji/GIF/storage/cold-restore/revocation checks. Test messages/friend requests only reach a local in-memory fixture. Native screenshots and JSON reports live in the launcher's `output/` directory. These checks do not establish live service activation or a real user's successful consent.

Release checklist:

1. Review the scoped diff and current handoff/HEAD; preserve unrelated work. Apply migration `20261108025403_nexus_social_sessions.sql` to the intended ChainLens database using its deployment workflow. Do not substitute the known-stale local service key for production credentials.
2. Deploy the bridge, backend wiring and first-party consent assets together. Existing `FRONTEND_URL` must be the canonical HTTPS frontend. No new third-party OAuth client or redirect registration is required; provider sign-in remains in ChainLens's browser flow.
3. Verify live config returns JSON with enabled=true and canonical endpoints; inspect exact deployed consent script. Verify unauthorized API denial, invalid grants, private table ACL/RLS and rejection of non-loopback redirects. Never log codes, bearer tokens or cookies.
4. Have the user complete actual browser consent from the packaged launcher. Confirm their account and existing friends. Do not send messages/friend requests without a specific user instruction.

Production database migrations `20261108025403_nexus_social_sessions` and `20261108025438_nexus_session_service_grants` are applied. The follow-up overrides project default service-role ALL grants to retain only SELECT/INSERT/DELETE. Browser roles are denied; RLS is enabled. Server release verification follows deployment; actual user consent remains a separate gate. No real messages or friend requests were sent.
