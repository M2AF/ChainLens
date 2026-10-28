# Castle Siege Android account login

The separate public client `castle-siege-android` connects the isolated Android
restoration to an existing ChainLens account. The native build retains Play
offline. This adds identity/session capability, not cloud saves, friends or PvP.
No account password, provider token, wallet information or holdings enters the APK.

## Flow and boundaries

1. The native launcher checks `/api/castle-siege/config`, generates a random state
   and S256 PKCE verifier, and stores the pending request encrypted.
2. It opens the system browser at `/auth/castle-siege`. The existing ChainLens
   Profile sign-in/account-creation flow remains responsible for authentication.
3. `/castle-connect.html` displays the account and asks for explicit consent.
   Authenticated `POST /api/castle-siege/authorize` validates the fixed client,
   exact redirect, browser origin and PKCE challenge, then issues a 60-second code.
4. The user taps Return to Castle Siege. Android resolves the exact callback
   `com.chainlens.ageofempirescastlesiege://auth/callback` to AccountActivity.
5. The app verifies state, URI and pending-request age, then exchanges the code and
   verifier at `/api/castle-siege/token`. Every exchange attempt consumes the code.
6. The server returns only account ID/display name and a random game credential.
   Its SHA256 hash is stored server-side for seven days. The phone encrypts its
   credential using AES-GCM and Android Keystore; an API-origin binding separates
   fixture and production storage. App backups are disabled in the account APK.
7. `/api/castle-siege/me` verifies expiry/account existence. Logout revokes the
   server credential and removes it locally. Offline logout removes the local
   credential and reports that the server session will expire automatically.

These credentials do not authorize general ChainLens profile/wallet APIs, DUO
sessions or other games. Current game routes expose only profile and logout.
In-flight codes are single-instance/in-memory; established sessions persist in
Supabase across backend restarts. New server capabilities require their own
routes, validation and consent; do not trust client save data for competitive play.

## Deployment

User explicitly approved the private migration and commit/push/deployment of the
login files on 2026-10-28. The migration is applied to the existing ChainLens
Supabase project and recorded as `20261028034815_castle_native_sessions`.
The local file matches that recorded version. The parent cl_users.id is UUID.

`public.cl_castle_sessions` has RLS enabled, no public policies, and no PUBLIC,
anon or authenticated grants. Only service_role has SELECT/INSERT/DELETE. Live
ACL/RLS queries verify this. The advisory INFO for RLS-with-no-policy is
intentional: browser database access is denied. No user account/profile rows were
changed, and no production test session was manufactured.

Deploy `castle-sso.js`, the two-line backend mount, `public/castle-connect.*`, and
the migration/test/documentation together. Keep FRONTEND_URL set to
`https://www.chainlensnft.info`. The Android build pins that origin and rejects a
configuration with a different authorization endpoint. No new provider secret,
client secret or OAuth provider registration is required.

Activation checks: config must return JSON 200 with enabled=true, the fixed client
and exact redirect; me without a credential must return JSON 401; the consent page
and assets must load. Actual user-account completion still requires the user to
sign in and approve the account on their phone. A green local fixture is not live
release verification.

## Validation

- 290 Node tests pass including five new native-client authorization/session tests
  and the existing DUO SSO tests. Source checks pass.
- Three browser consent journeys cover desktop/tablet/mobile, signed-out gating,
  existing-account focus refresh, explicit consent, native callback URI, PKCE
  exchange, minimal profile, credential isolation and logout.
- S21+ local fixture build15 verifies wrong-state rejection, PKCE exchange,
  encrypted-at-rest storage, force-stop/restart identity restoration and revocation.
  Latest fixture20 rechecks callback/credential/logout behavior and the landscape
  scroll fix; the cold-restart step was not repeated. No real credentials are used.
- The actual SQL migration is tested in ephemeral PostgreSQL (PGlite), including
  role denial, server-only hash storage, expiry constraints and account-delete
  cascade. Its live RLS/ACL checks pass after the approved migration.
- Android production-address build19 is locally debug-signed/installed. It has no
  fixture UI or loopback API transport. Native offline game/save restoration was
  checked after account-launcher integration. No multiplayer claim is made.

Native code/builds are in `C:/Users/balla/Documents/DUO/tools/castle-siege/`.
Build: `build-account.ps1 -Name <new-name>`; lab originals/key/dependencies stay
private under ignored data/castle-siege. Fixture/browser/native/SQL evidence is in
that folder's evidence directory; no credential/key is committed.

Design references: [OAuth for native apps](https://www.rfc-editor.org/rfc/rfc8252),
[Android Keystore](https://developer.android.com/privacy-and-security/keystore),
[Supabase API security](https://supabase.com/docs/guides/api/securing-your-api).
