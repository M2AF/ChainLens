# r3tards collab theme

ChainLens's third art theme, `r3tards`, follows the supplied screenshot and [r3tards.club](https://www.r3tards.club/): purple illustrated collage, heavy black outlines, white pill controls, handwritten headings and monospaced labels. It uses the same picker, account access gate, persistence, recolour/revert and material-clearing lifecycle as the existing art skins.

The main background is the user's exact `C:/Users/balla/Downloads/PC.webp`, copied unchanged to `public/themes/r3tards/background.webp` (1080 × 628). SHA256: `efb709e54512807e2f5cc55716a0870ce34169d875d5790334123a2233e1258e`. Purple panels provide readable surfaces over the collage. The source image already contains grain; no additional noise or generated art is needed.

## Assets and provenance

All runtime assets are local under `public/themes/r3tards/`:

- `background.webp`: user-supplied artwork, byte-identical copy.
- `logo.png`: original public project icon from `https://www.r3tards.club/logo.png`, used on the picker tile. Existing ChainLens/Magic Swap brand logos retain their original smooth line art with a neutral grayscale treatment.
- `schoolbell.woff2`: site's Latin Schoolbell font (`/_next/static/media/55c4d69ce8a7b1d7-s.p.woff2`), with Apache 2.0 notice `LICENSE-Schoolbell.txt` from Google Fonts `apache/schoolbell/LICENSE.txt`.
- `ibm-plex-mono-regular.woff2`: site's Latin IBM Plex Mono 400 (`/_next/static/media/d3ebbfd689654d3a-s.p.woff2`).
- `ibm-plex-mono-bold.woff2`: site's Latin IBM Plex Mono 700 (`/_next/static/media/37786be940ec402b-s.p.woff2`). The accompanying `OFL-IBMPlexMono.txt` is from Google Fonts `ofl/ibmplexmono/OFL.txt`.

The website's stylesheets confirmed Schoolbell/IBM Plex Mono, 2px black borders and white pill buttons. Reference HTML/CSS snapshots are in ignored `.local-artifacts/` files; their content is design reference only. No signing, transaction logic, external messaging, wallet checkout or backend schema is changed.

## Code and lifecycle

`public/theme-engine.js` registers ID `r3tards` and palette `#493259 / #ffffff / #ffffff`. Unlike the two wallet-derived skins, this collab starts in ChainLens. `public/index.html` loads its scoped `theme.css` after the shared art stylesheet. Keep rules scoped to `data-cl-art-theme='r3tards'`; its picker tile may show its own preview independently of the selected skin.

This skin has CSS borders rather than raster nine-slice frames. It explicitly clears shared frame materials. Schoolbell is display type; controls use IBM Plex Mono, and financial inputs/addresses retain precise monospace formatting. Brand filters apply only to the app's own logos. Uploaded banners, NFTs, chain icons, success and error colours retain their original appearance and meaning.

Release the engine, index, complete `public/themes/r3tards/` folder and updated shared theme documentation together. Existing recolour sync uses the unchanged profile wire format. This does not register the new skin in Magic Money Wallet; that would be a separate renderer adaptation.

## Validation

`test/theme-engine.test.js` checks all 15 shipped definitions and explicit material activation/clearing for all three art skins. The r3tards journey in `e2e/theme-picker.spec.js` checks desktop/390px/360px layouts, local fonts, background identity, white pill controls, Search, Scanner, Magic Swap, Profile, App Hub, Market/New Listings, reload, recolour/revert, and switching to both prior skins/custom colours/Dark.

Final local validation on 2026-10-08: `npm run check`, all 192 Node tests, six JSX precompiles, `git diff --check` and all 12 theme-picker browser tests passed. Screenshots were visually reviewed. The original background's byte identity and all local CSS asset URLs were verified; `.local-artifacts/r3tards/asset-manifest.json` records production asset hashes.

Screenshots are retained in `.local-artifacts/r3tards/`. Tests use local UI with mocked account/provider replies, not deployed account or real transaction validation. No commit, push or deployment is performed as part of the theme implementation.


## Scaling follow-up

Per the source-site reference, the collage now uses centered cover scaling without repetition in both the main app and sidebar. It fills each viewport with one image and crops naturally, showing larger faces in tall windows. The general corner token is 20px; navigation and primary actions keep explicit pill radii. The theme menu has a 640px cap and a viewport-relative cap that leaves clearance above the bottom ticker. It scrolls independently.

Scanner fields use a content-width-responsive grid (240px minimum columns) with shrinkable input flex children. This avoids the three-column viewport breakpoint overflowing beside the desktop sidebar. The rules apply only to r3tards; the scanner markup adds a semantic hook without changing handlers.

The browser regression covers 1080x1800, 1080x720, 900x900 and 360x900: input/toggle containment, no horizontal document overflow, rectangular menu bounds and access to the final menu action. Screenshots: `.local-artifacts/r3tards/r3tards-scaling-{scanner,menu}-*.png`. Local validation only; production release remains pending.
