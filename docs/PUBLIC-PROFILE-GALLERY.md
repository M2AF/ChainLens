# Public profile gallery and GIF modal

Implemented locally on 2026-10-12. App deployment remains with the user.

## Profile behavior

An authenticated owner opening their own `/<ChainLens ID>` sees the existing
Profile workspace, with the Profile navigation item selected. Visitors to another
account see its public profile. Signed-out visitors get the public view. Copy ID
is on the ID string under the name, matching the owner workspace.

Public profiles use separate Add Friend / request / Friends and Message controls.
Message requires an accepted friendship. The `…` menu provides Share Profile,
Copy Profile Link, Block/Unblock and Report. View Profile and Copy ID are absent
from this menu. Names in chat retain the existing contact-action menu.

The owner workspace has Display favorited NFTs and Display linked wallets settings.
Both default enabled under the user's requested public-profile behavior. PATCH
`/api/profile` validates booleans and binds updates to the JWT subject. Hidden
wallets are not queried or returned by the public profile endpoint. Visible
wallets return only chain, address, label and watch-only status. Email, provider
identities, verification records, linked social accounts and nonfavorite holdings
are not public.

## Synced favorite gallery

`GET /api/profiles/:id/favorites` reads the existing shared `cl_asset_filters`
document on every request. Only `favorite:mainnet:<canonical NFT identity>` entries
currently at state `f` appear. `u` tombstones and testnet favorites are excluded.
This preserves the Magic Money synchronization format without changing wallet
source or preference writes. Favorites need not be re-starred on the website.

The gallery shows 24 NFTs per page, with Load more, Refresh, lazy artwork and
detail modal. Public gallery reads refresh on focus and every 30 seconds. A
favorite remains visible with an unavailable-artwork placeholder when metadata
is absent; identity is not silently discarded. This is a curated favorites list,
not a statement that the profile currently owns each NFT.

The website publishes sanitized artwork snapshots for favorites already visible
in its scanner or owner portfolio. `/api/profile/favorite-artwork` accepts only
currently starred canonical keys, de-duplicates batches, binds the user to the
JWT subject and stores public-safe artwork fields. It retries after preference
sync and on focus. Favorites decisions remain in the original shared document.

For existing wallet-only stars, the resolver uses Alchemy token metadata, the
existing on-chain metadata repair reader (including Monad), Blockfrost with
Koios CIP-25/CIP-68 fallback for Cardano, and linked-owner DAS lookup for Solana.
Lowercased Solana preference keys are matched to original-case mints; lowercase
keys are never sent as mints. Owner addresses used internally are not returned.
Solana legacy recovery is bounded to eight 1,000-asset pages per linked owner and
a 15-second budget; snapshots preserve original mint case. Bitcoin inscription
art uses its canonical content endpoint. Failed or unsupported metadata remains
an explicit placeholder; arbitrary new chains are not claimed verified.

## Block and report

Blocks are backend enforced in both directions for new friend requests,
acceptance and DM reads/writes. Existing friendship/history records are retained
so unblocking can restore the conversation. Blocked participants are filtered
from friend lists, World Chat, presence and unread badges. A block does not make
an otherwise public profile private.

Reports require authentication, a supported reason and at most 1,000 characters;
the server binds the reporter and limits submissions to 20/day per account.
Reports are stored as pending in `cl_profile_reports` for operator review. No
notification service or moderation dashboard was added.

## GIF picker

The GIF button opens a modal outside the chat panel. It includes search,
Trending/reaction shortcuts, a responsive result grid, loading/error/empty states
and GIPHY attribution. Escape/backdrop/close dismiss it; focus enters the search
field and returns to the GIF button. Keyboard focus stays inside the modal.
Selecting a GIF sends to the current conversation and closes on success. An
unsent text draft is retained. Read cursors pause while the picker covers chat.
Superseded searches are aborted.

## Database and files

`sql/cl_public_profile_gallery.sql` was applied to the configured Supabase project
`vxrhosrktbknogyeyewy`: two visibility columns and backend-only
`cl_favorite_artwork`, `cl_user_blocks`, `cl_profile_reports` tables. RLS is enabled;
anon/authenticated table privileges are revoked. Service-role reads/writes and
sequence access were checked in a rolled-back transaction; no test block, report,
artwork snapshot or visibility update remains. The security advisor reports no
errors; no-policy INFO entries are expected for these backend-only tables.

Changed files:
- Backend: `backend-server.js`, `profile-social-service.js`, new
  `profile-community-service.js`, `public-favorites.js`.
- Frontend: `public/index.html`, `public/profile-social.jsx`,
  `public/profile-social.css`; new `public/social-modals.jsx`,
  `public/profile-controls.jsx`, `public/public-profile-gallery.jsx`.
- Tests: `test/profile-social.test.js`, `e2e/chat-ui.spec.js`,
  `e2e/profile-social.spec.js`; new `test/public-favorites.test.js`,
  `test/profile-community.test.js`, `e2e/profile-public-v2.spec.js`.
- SQL/documentation: new `sql/cl_public_profile_gallery.sql`, this document,
  update to `docs/PROFILE-SEARCH-CHAT.md`, and `HANDOFF.md` / `HANDOFF_LOG.md`.

## Verification

October 12 follow-up: the sidebar Profile button now navigates to the signed-in
account's UUID URL while opening the existing owner workspace. Public visibility
settings sit in the account column immediately below Sign out and above Social
accounts & passkeys. Public wallet addresses are full-width copy buttons with
confirmed success feedback and a clipboard-error message. Changes are in
`public/index.html`, `public/profile-social.jsx`, `public/profile-social.css`, and
`e2e/profile-public-v2.spec.js`. Syntax checks, 226 Node tests and all ten JSX
scripts pass. Affected browser checks cover owner URL/back/forward, settings
placement and saving, public clipboard copying, navigation from another user's
profile to your own, and mobile wallet layout. No commit or app deployment.
All three affected browser cases pass; reviewed screenshots are retained in
`.local-artifacts/profile-navigation/`.

Syntax check and all 226 Node tests pass. All ten JSX scripts compile. Final
profile/GIF/contact journeys pass in `.profile-v2-final-browser.log`, with prior
chat/unread/favorite synchronization regressions in `.profile-v2-regression.log`.
Initial failures were corrected: controlled settings needed immediate local state
with rollback, modal autofocus needed explicit priority, and a reopen-scroll
fixture needed to wait for messages before scrolling.

The supplied account has 15 live synced mainnet favorites across Ethereum,
Cardano, Monad, Robinhood and ApeChain. The actual resolver finds artwork
candidates for all 15 (`.profile-v2-live-artwork-verified.log`). All 15 images
decode in the browser (`.profile-v2-live-browser-final.log`); details are recorded
in `.local-artifacts/profile-v2/live-image-decoding.json`;
its transport supplies public profile/gallery JSON from the connector/resolver,
while loading real artwork from the original sources. It is not live authenticated
frontend integration.

Screenshots and detailed probes: `.local-artifacts/profile-v2/`. The local
Supabase service key remains unregistered, so authenticated local HTTP integration
cannot be certified with it. Production deployment credentials and actual
same-account device sync need normal-path release QA. No app deployment, commit,
wallet-source change, signing or broadcast occurred.

## Collectible card alignment (October14,2026)

Public favorite cards use a top-aligned flex column with a non-shrinking square
art frame. Artwork uses contain to preserve the full image, including portrait
and landscape art. Titles reserve two lines and truncate excess visually; the
button's full accessible name and NFT detail dialog retain the complete name.
Collection captions start at a consistent position within each grid row.

On user HEAD4c03d08, all6 public-profile browser cases pass, including alignment
checks at1440/1080/390px with mixed artwork dimensions, short/long captions,
overflow checks and detail opening. All three screenshots reviewed. Evidence:
`.local-artifacts/search-expansion/favorites-alignment-e2e.log` and
`test-results/favorites-aligned-{1440,1080,390}.png`.
Only gallery CSS and regression test changed; no backend/data/commit/deployment.
