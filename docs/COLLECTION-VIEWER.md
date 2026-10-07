# Complete collection mosaics and asset viewer

Local change, 2026-10-06. No commit, push or deployment.

Overview previously rendered only `tile.assets.slice(0,4)` even though all ownership records were loaded. Each collection now creates as many consecutive mosaic tiles as needed, with four items per full tile and one, two or three in the final tile. Two-item tiles stack vertically in a half-width column, including two-item remainders of larger collections; three-item tiles use one larger preview. Gallery tracks accommodate these narrower tiles without changing collection order. Pair controls are slightly smaller so they do not cover the artwork's center. Captions show the range and total, such as `5–8 of 10 items`. Collections remain grouped in floor/favorite order, and every NFT retains its own favorite, spam and detail controls. Matching numbered names supply a common collection label when the provider omits one.

Profile Overview, Holdings, Favorites and Spam pass their filtered, sorted gallery order to the shared asset viewer. Scanner NFT and token grids do the same. The viewer adds side arrows, list position, left/right keyboard navigation, Escape/backdrop/close actions, focus trapping and focus return. It stops at list boundaries rather than wrapping. The mobile layout stacks artwork and details; artwork uses contain sizing. Chain, floor price, attributes, description, token quantity/value, download and Retry artwork remain available. Opening/navigating the viewer uses existing asset records and does not rescan ownership.

Changed UI files: `public/profile-portfolio.jsx`, `public/profile-portfolio.css`, `public/index.html`. Browser coverage: `e2e/collection-viewer.spec.js` plus existing Profile/image/Scanner tests.

Validation:179 Node tests, syntax and six-script homepage precompile, diff check, seven unique browser checks across completed runs. The new test covers all ten collection records,4/4/2 layout, filtered-list arrows, decoded per-token images, keyboard/boundary behavior, focus trap/return, mobile overflow and one ownership request. Initial Profile-refresh login setup exceeded its5second assertion deadline; the isolated re-run passed. An overlapping retry lost its temporary server as the first run shut down; the sequential re-run passed without code changes.

The real previously captured Cardano adapter contains ten Lil Sappys. Local browser QA with mocked login rendered all ten across three Overview tiles and decoded10/10 artwork. Screenshots were reviewed:

- `.local-artifacts/nft-coverage/lil-sappys-mosaics.png`
- `.local-artifacts/nft-coverage/lil-sappys-viewer-desktop.png`
- `.local-artifacts/nft-coverage/lil-sappys-viewer-mobile.png`
- `.local-artifacts/nft-coverage/lil-sappys-viewer.json`

These are local UI/media checks, not production deployment or authentication verification. The prior Monad/Robinhood repair remains in the working tree and its unavailable-metadata cases are unchanged.

Two-item stacking follow-up: the collection viewer browser test checks vertical alignment, half-width footprint, adjacent collection spacing on desktop, mobile sizing and no horizontal overflow. Screenshots: `test-results/collection-mosaics-desktop.png` and `test-results/collection-mosaics-mobile.png`. Initial narrow-pair test exposed an overlay intercepting center clicks; reduced pair controls fix this while retaining favorite and spam actions.
