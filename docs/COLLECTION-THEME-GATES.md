# Collection theme gates

The canonical implementation and verification notes are in the sibling wallet's `docs/COLLECTION-THEME-GATES.md`.

`public/collection-theme-core.js` is generated from `../Magic Money Wallet/src/shared/collection-theme-access.ts`. `public/collection-holder.js` binds only freshly authenticated, verified EVM/Cardano profile wallets. The picker, theme application and docs-only picker all enforce the collection restrictions. Emonad requires 10,000 whole tokens with 18 decimals; Sealuminati/r3tards require at least one Monad ERC-721; Mallard requires a positive policy balance at the current payment address or its embedded key stake account, including associated staking/script holdings.

`theme-holder-cardano.js` mounts `/api/theme-holder/mallard` in the backend with the existing rate limiter. This fixed-policy, read-only Koios adapter supplies CORS-safe Cardano ownership results to both products. It validates the exact payment address and asset schema, detects repeated pages, rejects incomplete results, uses a 12-second total provider budget, and returns `Cache-Control: no-store`. There is no arbitrary proxy URL or signing path.

Deploy the backend endpoint and public frontend together for the ChainLens website. Wallet builds now use a direct native/background ownership bridge and no longer depend on this web endpoint. No deployment or phone installation was performed in this task.

Validation: `npm run check`, `npm test`, `npx playwright test e2e/theme-picker.spec.js --workers=1`; logs `.collection-*.log`. The additional four holder journeys check positive ownership, Emonad's threshold boundary, revocation/fallback, retry, provider failure and watch-only rejection.

The picker separates Art Designs from Material Designs using independent native disclosure controls. Six material definitions carry `material: true`; project art and Sovereign retain holder controls in Art Designs. Both sections start collapsed in the main app and Docs, after the builtin/custom colour rows and Create New, support keyboard toggling, and do not change the active theme when collapsed. Checks: `.design-sections-*.log`; screenshot `.local-artifacts/design-sections/chainlens.png`.

`mallard-policy-core.js` is generated from the sibling wallet `src/shared/mallard-policy.ts`; regenerate it after canonical reader edits. The live website returned homepage HTML at the new endpoint before deployment. Wallet direct-read fix and tests are documented in the sibling notes; `.mallard-native-*.log` records checks.

Stake-account coverage now matches the NFT scanner: the fixed-policy reader derives and validates the key reward address locally from the Bech32 mainnet base address. It checks exact `account_assets` only after direct holdings are zero and validates returned stake/policy/quantity. The supplied user address had direct0 but MallardOrder3348 quantity1 in its associated staking/script account; the production reader now returns1. See `.mallard-stake-*.log` and the sibling wallet notes.

Default-collapsed follow-up: `.sections-collapsed-{check,tests,browser}.log`;202Node tests/four browser journeys and six JSX precompiles pass. Screenshot `.local-artifacts/design-sections/chainlens-default-collapsed.png`. Existing colour and Sappy holder/animation behavior retained.

Disclosure headers use a white rounded label pill with black text, joined by a white horizontal rail to the right chevron in main app and Docs. Only the chevron rotates when opened; native keyboard/default-collapse and custom-colour ordering retained. Final checks `.sappy-pill-{check,tests,browser}.log` pass:202Node tests and3browser journeys.
