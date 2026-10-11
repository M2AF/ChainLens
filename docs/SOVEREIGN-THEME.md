# Sovereign on ChainLens

Sovereign is the first art theme in the picker. It carries the wallet's obsidian/champagne palette, original orbital and crown SVG artwork, smoked translucent panels, local Garamond headings, smooth brand line art and pointer/touch lighting. Financial/chart/user artwork is not recolored by a global image filter. Art themes remain non-customizable.

## Holder access

Existing ChainLens theme eligibility still applies. A fresh authenticated `/api/profile` supplies linked wallets; only `chain: evm`, `watch_only: false` and valid EVM addresses are checked. A holder balance in any of these verified wallets unlocks Sovereign. LocalStorage theme preference, watch-only addresses and collectible display caches cannot grant access.

The reader validates Robinhood mainnet chain4663, gets a block number and calls ERC721 `balanceOf` at that block on contract `0x0351566C7e98780A591c08000576a01801241B31`. At least one NFT is required. Strict uint256 decoding,10-second timeout, generation guards and request cancellation prevent malformed, hung or old-session replies from unlocking it. Results expire after90seconds; the visible selected theme refreshes every60seconds and on focus/visibility changes. Sign-out/profile changes immediately clear access. A failed check or zero balance removes the art and restores base Dark, while keeping the saved preference for a later valid holder check. Recheck ownership appears in the picker.

This is a client-side cosmetic entitlement, matching the wallet's gate, not encrypted art or a server-side authorization system. No signatures, approvals, transaction submissions or provider changes. The standalone documentation page leaves Sovereign disabled with a main-app verification hint and falls back to its base mode; it does not claim holder verification.

## Motion lifecycle

`public/sovereign.js` manages one inert, pointer-transparent scene. CSS rotates the orbit and ambient aura. Pointer events update light coordinates at most once per frame; touches update the same lighting without preventing scrolling. Enabled-button presses create bounded650ms rings, at most6 at once. Reduced-motion and page visibility pause animation/listeners and remove press effects. Leaving the skin removes the scene and pointer properties. Asset paths are local: `public/themes/sovereign/{orbit,crest}.svg`, copied from the wallet's original artwork; material rules are in `theme.css`.

## Verification

`npm run check`, explicit syntax checks of `public/sovereign.js` and `public/docs-ui.js`, and all198 Node tests pass. Five gate tests cover exact calldata, verified/watch-only identity, chain/zero balance, stale replies and timeout. All15 existing picker journeys pass with23shipped themes. The additional Sovereign browser journey passes holder/nonholder checks, recheck/error revocation, watch-only exclusion, saved preference reload, active animation progress, pointer response, press rings, reduced motion and360/390-style mobile versus1280px desktop geometry (this journey uses390 and1280).

Screenshots reviewed in `.local-artifacts/sovereign/`: search desktop/mobile, scanner and swap. Logs `.sovereign-{check,tests,browser,motion}.log`. Browser profile, provider and ownership data are deterministic fixtures; this iteration does not claim live account or native phone QA. Earlier wallet contract verification remains in the wallet's holder-access documentation.

Implemented locally; no commit or deployment. The backend/profile schema and wallet checkout are unchanged.
