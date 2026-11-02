# ChainLens Arcade

Castle Siege is the seventh local Arcade entry, shown as a **campaign preview**.
Its original 192x192 XAPK icon is copied unchanged to
`public/arcade/castle-siege-icon.png`. The destination is
`https://duo.magicmoney.dev/castle-siege/`, served by the DUO checkout's new
standalone browser page. It currently offers Kenilworth, local battle saves and
offline caching after the first load. ChainLens login, cloud progress, friends and
multiplayer are future work; the card makes no account or online-play claim.

Deploy the DUO game route before enabling this card publicly. These are local
source changes, with no deployment performed. Arcade tests stub the external
destination; the separate DUO browser tests exercise actual gameplay controls and
offline reload. Original icon hash is recorded in the Castle Siege project notes.

The sidebar Arcade button sits between Scanner and Magic Swap. It opens the internal `/arcade` page (also accepts `?tab=arcade`), with a responsive grid ready for additional games. DUO is the first game: original logo copied from DUO, description, features, and a Play link opening https://duo.magicmoney.dev/duo/ in a new tab. No authentication bridge changes are included.

Files: `public/index.html`, `public/arcade.css`, `public/arcade/duo-logo.png`, `e2e/arcade.spec.js`.

Validation: npm run check, 282 Node tests and production precompilation pass. Three Playwright journeys cover desktop/tablet/mobile navigation ordering, logo loading, no horizontal overflow, deep-link refresh, back/forward and Play destination (external response stubbed). Screenshots: `test-results/arcade-{desktop,tablet,mobile}.png`.

Local source change only. Deploy the frontend and the new CSS/logo files with the existing release process to show it on the public site. The Play link intentionally targets the provided DUO home URL; shared account SSO remains separate work.

DUO Poker is the second entry, using the supplied original `logos/poker_logo.png` copied to `public/arcade/poker-logo.png`. Its Play button opens https://duo.magicmoney.dev/poker/. Both game links and responsive card placement are covered by the three Arcade browser journeys. Poker artwork uses a lighter panel to retain the supplied dark logo colors.

DUO Pool is the third entry, using the supplied original `DUO/logos/pool.png` copied unchanged to `public/arcade/pool-logo.png`. Its Play button opens https://duo.magicmoney.dev/pool/ in a new tab. The landscape artwork is contained in a dark panel without cropping. The Arcade browser journeys cover all four logos and Play destinations, responsive placement, overflow and refresh. External game responses are stubbed for navigation checks; these checks do not validate gameplay. Local source only; frontend deployment remains separate.
SWARM is the fourth entry, using the supplied Swarm logo (trimmed to its artwork) at `public/arcade/swarm-logo.png`. Its Play button opens https://duo.magicmoney.dev/swarm/ in a new tab and is covered by the same Arcade browser journeys. The heading, image alt text and accessible labels use SWARM without the DUO prefix.

CLASH is the fifth entry, using the attached original logo copied unchanged to `public/arcade/clash-logo.png`, displayed with its full landscape proportions. Its Play button opens https://duo.magicmoney.dev/clash/ in a new tab. The three Arcade journeys cover all five logo loads and launch destinations, responsive placement, absence of horizontal overflow, and refresh/back/forward behavior. External game responses are stubbed; gameplay is not validated. Local source change only; deployment remains separate.

The custom-domain root `https://duo.magicmoney.dev/` now serves the Arcade hub. The DUO card-game Play button targets `/duo/`, matching the live hub menu. All Arcade Play buttons use this custom domain.
