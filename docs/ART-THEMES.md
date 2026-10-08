# Magic Money art themes in ChainLens

ChainLens ships Mallard Order and Sealuminati in the theme picker's **Art themes** group. Theme access follows the existing linked-wallet and Google/Discord account gate. Selection persists in `cl_theme`; custom colour sync still uses the existing profile theme wire format and endpoints.

Mallard Order uses carved stone frames, a stone texture, gold accents, Cinzel headings and Garamond body text. Sealuminati uses dark purple cloth, gold rune frames with violet torches, Pixelify typography and a seal peeking above the Search field. ChainLens and Magic Swap logos remain smooth; their gold treatment preserves their original shading. User artwork, chain logos, addresses, and financial status colours retain their meaning.

## Implementation

- `public/theme-engine.js` keeps the wallet's IDs and three-colour palettes. `applyTheme(colors, artId)` stamps `data-cl-art-theme` only for an explicit shipped art ID with its original palette.
- `public/art-themes.css` supplies scoped textures, local fonts, nine-slice frames, buttons, navigation, and previews. Search, Scanner, Profile, App Hub and Magic Swap use existing component hooks; New Listings event cards also receive frames.
- `public/index.html` registers the stylesheet, picker group and component hooks. `public/search-page.jsx` supplies stable hero/form hooks.
- `public/themes/` contains byte-identical copies of the approved wallet assets from `../Magic Money Wallet/src/renderer/assets/themes/`. Font OFL notices are included alongside the fonts. These are existing approved assets, not newly generated art.

The wallet stylesheet cannot be imported directly: ChainLens renders through its Tailwind palette and its own component structure. Preserve the palette derivation and add semantic material hooks here instead.

## Lifecycle

Selecting another art theme replaces the material identity. Light, Dark, ordinary colour themes, custom colours and access loss clear it. Recolouring an art theme deliberately renders its edited palette without the original materials; **Revert to default** restores its artwork. A custom palette with the same three colours does not acquire a skin by coincidence. This avoids mismatching fixed artwork with arbitrary backgrounds or leaking a previous skin into another theme.

Keep frames inside panel bounds with sufficient content padding. Do not put image-rendering or colour filters on broad ancestors containing NFTs or chain icons. Seal crest artwork alone uses pixel rendering; the brand logos use normal rendering. Decorative elements must not capture pointer events.

## Validation and release

`test/theme-engine.test.js` checks palettes, contrast derivation and material activation/clearing. `e2e/theme-picker.spec.js` exercises both skins on desktop and mobile, reload persistence, recolour/revert, custom/base fallback, access loss, and Profile/App Hub artwork preservation. Browser account/API fixtures prove local UI behaviour, not a deployed account or real swap settlement.

Validation on 2026-10-08: `npm run check`, all 192 Node tests, all six JSX precompiles and 12 unique browser checks passed across focused runs. Search was checked at 1280, 390 and 360 pixels; Scanner at 360; Swap, Profile and App Hub at desktop/mobile sizes; New Listings at 390. Reload and all material clearing/restoring paths passed. The unthemed DEX/Cross-Chain navigation smoke also passed. Copied assets hash-match their wallet sources.

Local browser screenshots are retained in `.local-artifacts/art-themes/`. Release the frontend files, stylesheet and complete `public/themes/` directories together. No backend schema or wallet change is required. This implementation is local; deployment is a separate action.
