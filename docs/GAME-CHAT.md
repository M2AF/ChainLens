# Game World Chats and Lobby Chats

Each of DUO, Poker, Pool, SWARM, CLASH and DUO World has its own World Chat. ChainLens Messenger exposes those same six independent histories under Game Rooms. Existing ChainLens World Chat and friend DMs are separate.

Every game page has a Chat button with World Chat and Lobby Chat tabs. Lobby Chat is scoped to the current online room, stays inside the game service, retains the latest 100 messages in memory and resets when the room/server is removed or restarted. It is not copied into ChainLens. An account must have a current authenticated game socket in that exact lobby to read or send. Guests and standalone wallet/social logins are denied; shared social login through ChainLens resolves to the ChainLens account and is accepted.

## Identity and storage

ChainLens issues a seven-day game-chat capability during its existing one-use PKCE SSO exchange. Its signing key is derived separately from the account JWT secret and has its own audience/scope, so it cannot authorize account or wallet endpoints. Explicit game-social aliases reuse only the existing friendship handlers for player-chosen actions; all existing eligibility, ownership and block checks still apply. DUO stores it in the private server session, not the browser response. The server verifies the ChainLens account on every shared-room request and derives the author from the authenticated subject. User-provided account IDs/names do not authorize messages.

DUO proxies World Chat through its server to ChainLens. The ChainLens backend uses its existing database client to access public.cl_game_messages, scoped by an allowlisted game key. Browser database grants are revoked and RLS is enabled. Existing profile avatars and block filters apply. World Chat text retains the existing 500-character/no-links rule; GIFs sent through ChainLens are displayed in game. Lobby Chat supports text with the same length limit and rejects links. Posting is rate limited; feeds refresh approximately every three seconds.

Friends in ChainLens is collapsed by default below the game room list. Expanding it shows the friends/requests plus account-ID and add-friend controls at the bottom. Legacy World Chat/Friends keep their existing wallet/social eligibility gate; Game Rooms require a ChainLens account only. Room drafts remain separate and survive page/pop-out changes.

## Deployment order (not performed by this change)

1. Apply ChainLens sql/cl_game_chat.sql to the existing ChainLens Supabase project.
2. Deploy ChainLens backend, public/index.html and public/profile-social.css together, including game-chat.js and duo-sso.js.
3. Deploy DUO with server/game-chat.js and client/game-chat.{js,css}, plus the auth/menu/socket integration changes. Existing CHAINLENS_ORIGIN/default production origin is reused. No new shared secret or database permission is needed on DUO.
4. Existing DUO sessions must sign out and sign in through ChainLens once to receive a limited chat capability. A later expiration requires another sign-in; current game saves/account IDs remain unchanged.
5. Verify live messages in each game's World Chat appear in its matching ChainLens room and in no other room. Verify different lobbies cannot read each other and guests cannot read or post either channel.

The database migration and app deployments have not been performed. Local fixture tests do not establish production delivery or native-device behavior.

## Validation

ChainLens: npm run check; npm test; npx playwright test e2e/chat-ui.spec.js. UI tests cover room isolation, posting, per-room drafts, friend drawer, existing DMs/GIF/unread flows, and desktop/tablet/mobile layouts.

DUO: npm run build; node --test --test-concurrency=1 --test-skip-pattern="a holdem table with bots deals hand after hand|a blackjack table with bots deals hand after hand" test/*.test.js. Those two existing Poker timer tests have 400ms assumptions and can leak timers after a failure. Serial execution also avoids preexisting test fixtures sharing port 3997.

Cross-server browser fixture: node tools/game-chat-browser.cjs <ChainLens checkout>. It uses a disposable local data directory, real game pages, actual game sockets and the production chat modules against an in-memory database fixture. It tests two-way World Chat and private Lobby Chat in all six games, distributing desktop/tablet/mobile widths. It never accesses production data. Evidence: DUO dist/ui-review/game-chat/report.json and screenshots; ChainLens .local-artifacts/game-chat/game-{rooms,friends}-*.png.

### Local results, 2026-10-21

- DUO base 94dcf01 plus local changes: build, syntax and diff checks pass; filtered serial suite 156 pass, one real-Postgres test skipped, two existing 400ms Poker timing tests excluded. World network test now waits for the actual observed movement instead of a fixed sleep and verifies guest legacy chat is rejected.
- ChainLens base 3f3de23 plus local changes: source checks and 14 inline JSX compiles pass; 284 Node tests pass. Full existing+new chat UI suite 10/10 passes; account-only Game Room test passes separately (15-second account-startup allowance). Final responsive replay of the three room/drawer journeys passes. Screenshots reviewed at 1440/768/390 widths.
- All six actual game pages pass two-server browser fixtures, with live game WebSocket membership, two-way room messages, lobby privacy, real keyboard typing and no page exceptions. See DUO dist/game-chat-keyboard-browser.log.
- Supabase migration and production deployments remain unapplied. No production chat messages or friendships were created by validation. No commits or pushes were made.

### Production database fix, 2026-10-21

After the user deployed ChainLens, the Game Room API returned unavailable because public.cl_game_messages did not exist. Applied the prepared cl_game_chat migration to vxrhosrktbknogyeyewy and notified PostgREST to reload its schema. Verified RLS enabled, no anon/authenticated SELECT, server-role privileges and a successful SELECT as service_role. No real chat messages were posted during verification. Earlier statements above that the migration is unapplied describe the initial local delivery only.

Existing DUO sessions from before this feature lack chainlensId and the scoped chat capability; log out inside DUO and log in with ChainLens once (the ChainLens website session can stay signed in). Full signed-in production round-trip remains to be confirmed by the user. The local checkout's Supabase service key reports Unregistered API key; it was not changed or copied to Render.

## Player pictures and profile menus

World and Lobby Chat show each message author’s public ChainLens picture. Pictures with both avatar_url and avatar_nft_key use the same clipped hexagon and animated multicolor ring as ChainLens; other pictures use a borderless circle. Missing/unavailable pictures fall back to initials. Rendering never infers NFT status from an image URL.

Click an author’s name to open View Profile (new tab to https://www.chainlensnft.info/<id>), Add Friend/Cancel Request, Copy ID, and Copy Profile Link. Existing friendships show Remove Friend; incoming requests show Accept/Decline. Self menus omit friendship actions. Friendship status is loaded from ChainLens when the menu opens; requests and cancellations use the existing friendship implementation and its eligibility/ownership/block checks. Menus support Escape, arrow keys, focus restoration and outside click. Polling does not replace the name button while its menu is open.

ChainLens adds GET /api/chat/games/:game/profiles?ids=<comma-separated-UUIDs> with an explicit public-field projection (id, display_name, avatar_url, avatar_nft_key only). Four /api/game-social/friends aliases accept the existing scoped game credential and reuse the original list/add/accept/delete handlers. General profile, wallet, account and DM endpoints continue to require the normal account session. DUO proxies only the allowlisted friendship routes, strips browser-supplied author fields and keeps the scoped credential server-side.

Lobby authors’ current public pictures are fetched in a bounded batch with an account-scoped 60-second cache, capped at 2000 entries. Public-profile lookup failure does not discard an accepted lobby message or disable text chat; it temporarily leaves the known name/initials. No new database schema, provider secret or dependency is required.

Release this extension in ChainLens first (game-chat.js, backend aliases and consent copy), then DUO (server/game-chat.js, client/chat-people.js and game-chat JS/CSS). Existing valid game-chat sessions continue to work. No app deployment was performed for this extension.

Browser validation command: node tools/game-chat-browser.cjs <ChainLens checkout> --people. It uses local fixtures, exercises all six real game pages and live lobby membership, and tests NFT/photo styles, profile links, actual clipboard copying, Add/Cancel Request, menu stability across polling, keyboard navigation and matching lobby avatars. Evidence is saved under DUO dist/ui-review/chat-people/.
