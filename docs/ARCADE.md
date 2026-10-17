# ChainLens Arcade

The sidebar Arcade button sits between Scanner and Magic Swap. It opens the internal `/arcade` page (also accepts `?tab=arcade`), with a responsive grid ready for additional games. DUO is the first game: original logo copied from DUO, description, features, and a Play link opening https://duo-u3mp.onrender.com/ in a new tab. No authentication bridge changes are included.

Files: `public/index.html`, `public/arcade.css`, `public/arcade/duo-logo.png`, `e2e/arcade.spec.js`.

Validation: npm run check, 282 Node tests and production precompilation pass. Three Playwright journeys cover desktop/tablet/mobile navigation ordering, logo loading, no horizontal overflow, deep-link refresh, back/forward and Play destination (external response stubbed). Screenshots: `test-results/arcade-{desktop,tablet,mobile}.png`.

Local source change only. Deploy the frontend and the new CSS/logo files with the existing release process to show it on the public site. The Play link intentionally targets the provided DUO home URL; shared account SSO remains separate work.

DUO Poker is the second entry, using the supplied original `logos/poker_logo.png` copied to `public/arcade/poker-logo.png`. Its Play button opens https://duo-u3mp.onrender.com/poker/. Both game links and responsive card placement are covered by the three Arcade browser journeys. Poker artwork uses a lighter panel to retain the supplied dark logo colors.
