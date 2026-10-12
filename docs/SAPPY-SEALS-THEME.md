# Sappy Seals on ChainLens

Immutable holder-only art ID `sappy-seals-art`; retired colour ID `sappy-seals` still migrates to Mint & Money. Flat black surfaces, neutral white/grey accents, rounded controls and a dashed Search hero/picker. Original smooth ChainLens/Magic Swap brands stay intact. Sappy remains in Art Designs, with seven art designs and six materials; Emonad stays immediately above r3tards.

The original Live2D seal sits at the bottom of the left sidebar, below its independently scrolling navigation. It persists across app pages. On mobile it belongs to the navigation drawer, whose closed/offscreen scene pauses even when its boundary touches the viewport edge. Footer/canvas cannot intercept navigation clicks. Pointer/touch tracking and the13 click-motion cycle are shared with Magic Money; reduced-motion and hidden scenes pause. Theme/account removal destroys the scene.

Default atlas is the exact user-supplied `Seal Login.4096/texture.png`. The previous `texture_00.png` is a locally persisted alternate (`cl_sappy_seal_alternate.v1`), available via a26px shirt icon immediately left of ownership refresh on the selected theme tile. Artwork preference grants no entitlement.

Access reads Ethereum mainnet ERC721 `0x364C828eE171616a39897688A831c2499aD972ec`: verified chain ID, interface support, measured block and positive balance. Only linked non-watch-only wallets enter the existing shared collection controller. Existing profile eligibility,90-second freshness/session guards, zero/error revocation and compact refresh behavior remain. Static Docs offers a disabled verify-on-main-app entry rather than bypassing ownership. Art colours cannot be edited.

`node scripts/build-sappy-seals.js` regenerates the website component and collection reader from the canonical sibling Magic Money Wallet source, copying local assets and the Pixi MIT license. The generator adapts React UMD globals, static local URLs, art-identity attributes, install-specific appearance key and mobile intersection thresholds. Runtime is lazily loaded after theme activation; local Pixi CSP patch avoids JS unsafe-eval. The model receives no wallet APIs. Generated files are served directly; production startup does not require the sibling checkout or a regeneration step. No dependencies added.

Validation: npm run check,202Node tests, homepage six-JSX precompile, generated bundle syntax and four browser journeys (Sappy, Mallard gate, Art/Material collapses, old Sappy-to-Mint migration). Sappy checks actual WebGL readiness and changing Cubism head parameters, all13 SDK motion starts, variants and reload, reduced-motion/closed-drawer pause, desktop/mobile navigation, scene removal on theme switch, zero balance/provider failure and watch-only rejection. Headless tests use software WebGL flags; browser fallback remains a static head when WebGL is unavailable.

Evidence `.sappy-{check,tests,browser}.log` and final `.sappy-final-browser.log`; screenshots `.local-artifacts/sappy-seals/{desktop,picker,mobile-sidebar}.png`. Local implementation only; no commit/deploy, production verification or native phone installation.

Final Sappy stylesheet loads after generic art/material sheets; selected tile white outline/18px rounding verified. Correct default atlas SHA256 matches supplied source.
