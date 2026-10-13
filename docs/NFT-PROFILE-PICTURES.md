# NFT profile pictures

ChainLens and Magic Money now offer **Use as profile picture** in the details
of an eligible NFT in the user's loaded collection. ChainLens opens its existing
editor with that NFT selected; Magic Money saves from the NFT details and reports
the result. Spam/hidden NFTs cannot be selected through these actions.

The picture picker reuses the collection already loaded for the Profile/Scanner
in ChainLens and for the mounted Portfolio in Magic Money. Magic Money shares
pending inventory requests as well as completed results, scoped to the address,
account index and network, with a five-minute lifetime and invalidation on account
change/lock. It retains incremental collection updates. Opening the picker does
not launch a second inventory scan when that collection is available.

Both pickers show the complete eligible collection, with search and a scrollable
body that leaves the header and save/cancel controls accessible. ChainLens applies
its existing automatic suspicion rules plus synced manual spam/hidden decisions,
including explicit restores. Magic Money applies the same manual hidden/spam
lists used by its portfolio. Both use the existing artwork loader.

The shared nullable `cl_users.avatar_nft_key` records the selected NFT's canonical
identity alongside `avatar_url`. NFT selections get a hexagonal crop and animated
multicolour perimeter in owner/public profiles and Messenger/chat avatars. Uploaded
and social photos stay circular. Reduced motion stops the perimeter animation.
An upload, removal or legacy avatar write clears the identity; display-name-only
updates retain it. Existing pictures remain circular until explicitly reselected
as an NFT because a URL alone cannot establish their source. This field describes
the selection; it is not a live token-ownership attestation.

Profile saves retain the existing session/signature authentication. The wallet's
extension/Capacitor path now sends the actual profile UUID instead of an EVM
address as the user ID. The Worker authorizes against verified linked EVM wallets
instead of requiring an EVM-created profile, supporting Solana/social-created
profiles without allowing watch-only or unrelated account writes. Save failures
leave the editor open with an error, rather than reporting a false success.

## Changed files

ChainLens: `backend-server.js`, `profile-social-service.js`, `profile-avatar.js`,
`public/index.html`, `public/profile-avatar.jsx`, `public/profile-avatar.css`,
`public/profile-portfolio.jsx`, `public/profile-social.jsx`,
`test/profile-avatar.test.js`, `test/profile-social.test.js`,
`e2e/nft-avatar.spec.js`, `e2e/profile-portfolio.spec.js`,
`supabase/migrations/20261013011836_nft_profile_avatar.sql`, this document and
handoff board/journal/archive.

Magic Money: `cloudflare-worker/db.js`, `cloudflare-worker/profile-avatar.js`,
`src/extension/wallet-handlers.ts`, `src/main/chainlens-chat.ts`,
`src/main/chainlens-chat.test.ts`, `src/main/worker-profile-avatar.test.ts`,
`src/main/ipc-handlers.ts`, `src/main/supabase-sync.ts`, `src/preload/index.ts`,
`src/renderer/types/wallet.ts`, `src/renderer/pages/DashboardPage.tsx`,
`src/renderer/pages/ProfilePage.tsx`, `src/renderer/pages/MessengerPage.tsx`,
`src/renderer/components/ProfileAvatar.tsx`,
`src/renderer/components/ProfileAvatar.css`,
`src/renderer/lib/profile-collectibles.ts`,
`src/renderer/lib/profile-collectibles.test.ts`, `e2e/nft-avatar.spec.ts`, companion
documentation and handoff board/journal/archive.

## Validation and release state

ChainLens: syntax checks, 228 Node tests and eleven JSX scripts pass. Eleven unique
affected browser journeys pass across the final runs: three avatar journeys, three
portfolio/cache/spam journeys and five public-profile/GIF journeys. Desktop/mobile
picker and hexagon screenshots reviewed; `.local-artifacts/nft-avatar/`.
Logs: `.nft-avatar-node.log`, `.nft-avatar-browser-final.log`,
`.nft-avatar-portfolio-final.log`, `.nft-avatar-visual-reviewed.log`,
`.nft-avatar-public-final.log`.

Magic Money: five TypeScript targets, 174 test files/2,517 unit tests, and fresh
Electron/extension/injection builds pass. Focused cache/session, signed Worker
update and chat tests pass (24 checks); full `CI=1 npm run verify:ci` browser and
critical-audit stages are in progress in
`.nft-avatar-verify-ci-complete.log`. GitHub CI for base `b11a019` is
[green](https://github.com/M2AF/Magic-Money-Wallet/actions/runs/38290711616);
these uncommitted changes have **GitHub CI pending**.

The additive database column/constraint is applied to the shared Supabase project.
A test update was rolled back; existing user pictures were preserved. `cl_users`
RLS remains enabled and browser-role reads/writes remain revoked. The actual
ChainLens/Worker avatar validators agree on accepted/rejected payloads.

No commit, push, application/Worker deployment or device install occurred.
Release requires the updated ChainLens frontend/backend, wallet Worker, and wallet
build together. Native Android/iOS runtime and production authenticated sync are
separate release QA; local browser fixtures do not establish those.
