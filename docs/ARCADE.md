# ChainLens Arcade

The sidebar Arcade button sits between Scanner and Magic Swap. It opens the internal `/arcade` page (also accepts `?tab=arcade`), with a responsive grid ready for additional games. DUO is the first game: original logo copied from DUO, description, features, and a Play link opening https://duo-u3mp.onrender.com/ in a new tab. No authentication bridge changes are included.

Files: `public/index.html`, `public/arcade.css`, `public/arcade/duo-logo.png`, `e2e/arcade.spec.js`.

Validation: npm run check, 282 Node tests and production precompilation pass. Three Playwright journeys cover desktop/tablet/mobile navigation ordering, logo loading, no horizontal overflow, deep-link refresh, back/forward and Play destination (external response stubbed). Screenshots: `test-results/arcade-{desktop,tablet,mobile}.png`.

Local source change only. Deploy the frontend and the new CSS/logo files with the existing release process to show it on the public site. The Play link intentionally targets the provided DUO home URL; shared account SSO remains separate work.

DUO Poker is the second entry, using the supplied original `logos/poker_logo.png` copied to `public/arcade/poker-logo.png`. Its Play button opens https://duo-u3mp.onrender.com/poker/. Both game links and responsive card placement are covered by the three Arcade browser journeys. Poker artwork uses a lighter panel to retain the supplied dark logo colors.

DUO Pool is the third entry, using the supplied original `DUO/logos/pool.png` copied unchanged to `public/arcade/pool-logo.png`. Its Play button opens https://duo-u3mp.onrender.com/pool/ in a new tab. The landscape artwork is contained in a dark panel without cropping. The Arcade browser journeys cover all four logos and Play destinations, responsive placement, overflow and refresh. External game responses are stubbed for navigation checks; these checks do not validate gameplay. Local source only; frontend deployment remains separate.
DUO Swarm is the fourth entry, using the supplied Swarm logo (trimmed to its artwork) at `public/arcade/swarm-logo.png`. Its Play button opens https://duo-u3mp.onrender.com/swarm/ in a new tab and is covered by the same Arcade browser journeys.
