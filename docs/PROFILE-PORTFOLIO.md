# Profile portfolio gallery

Implemented locally on 2026-10-06. The OpenSea screenshot supplied by the user guides the collection mosaic; existing ChainLens branding and account controls remain.

The signed-in Profile tab now has a compact left account panel, expandable social/passkey and linked-wallet sections, a 3:1 banner, and an NFT gallery. Overview groups by chain and collection into four-image quilts and individual tiles of varied height. Holdings shows individual NFTs; Favorites uses shared ChainLens-ID stars. Search, chain and metadata category filters apply independently. Category tags come from provider metadata, not guesses about an NFT's artwork; uncategorized items remain Collectibles. Trades/offers/activity integrations are not added by this portfolio implementation.

`public/profile-portfolio.jsx` owns portfolio data at the app/session level, separately from scanner state. All linked EVM addresses are scanned across the catalog's EVM chains; other linked addresses use their own chain adapter. Watch-only wallets are included. Requests are deduplicated, six are in flight at a time, and completed pages publish early. Alchemy, Moralis and Helius continuation pages are followed; repeated cursors fail explicitly. Per-page browser requests have a 30-second deadline. Canonical NFT keys prevent duplicates across linked wallets.

Loaded assets accumulate for the signed-in session, including while scanner state changes or linked wallets are edited. The Profile DOM stays mounted during navigation. Background previews are loaded through six image workers and retained in memory. Filtering changes rendered tiles but retains their data and preview cache. Logout/account identity change clears holdings and cache; refresh begins a new session. A failed source is reported while earlier results stay visible. A retained snapshot can include sold NFTs until refresh, as requested. Very large galleries cost memory because session retention is intentional; no production performance benchmark was performed.

Coverage matches existing scanner adapters. Bitcoin, Polkadot, Tron and Dogecoin currently have no NFT indexer and return no NFTs. Some other chain sources may be unavailable or require valid server provider keys. This does not invent coverage or imply every chain has a complete NFT indexer.

Banner upload accepts JPG/PNG/WebP up to10MB, center-crops to1500×500 and encodes JPEG. The authenticated existing profile PATCH stores `cl_users.banner_url`; server validation rejects unsafe schemes, SVG and oversized payloads. A banner may be removed. This follows the existing avatar data-URL storage approach and uses no new storage bucket or client credentials.

Before deployment, run the additive deployment SQL `sql/cl_profile_banner.sql` in the project's normal database release workflow, then deploy the backend and static assets together. SQL was prepared but not applied. A read-only database probe using the existing local server credential returned `Unregistered API key`, so actual database persistence is unverified. No live write, deployment or wallet change occurred.

Verification:143 unit tests; backend syntax and six-script homepage precompile; browser profile journey with38 fixture NFTs across multiple wallets/chains and a second provider page, canonical dedupe, preserved image DOM after navigation, favorites and chain filtering,1500×500 upload, mobile overflow and logout. Favorites and visibility browser regressions are also checked. Screenshots use clearly synthetic artwork and mocked accounts/providers; these are layout and functional evidence, not live portfolio QA.

Screenshots: `test-results/profile-portfolio-desktop.png`, `profile-portfolio-mobile.png`, `profile-portfolio-banner.png`, `profile-portfolio-account.png` (expanded account controls). Browser command: `npx playwright test e2e/profile-portfolio.spec.js e2e/profile-favorites.spec.js e2e/spam-assets.spec.js` (five checks pass). The profile journey was repeated successfully after compact account styling and expanded-panel assertions.

## Metadata render crash fix

The first production report showed `((intermediate value) || []).find is not a function` in the category renderer. Traits were assumed to be an array; Cardano/provider dictionaries and scalar metadata violate that assumption. `public/nft-metadata.js` now normalizes dictionaries, arrays and serialized JSON into scalar trait pairs, dropping malformed members and nested values that React cannot render. The portfolio loader, category lookup and NFT detail modal use this same normalizer.

The browser fixture now includes trait objects, strings, numbers, nulls and malformed arrays; before the fix it crashed the page and detached navigation. Targeted tests cover normalization and safe React values, and the profile journey opens both dictionary-trait and malformed-trait NFT details. Deploy the updated frontend including the new `public/nft-metadata.js` file; this fix requires no additional SQL or backend change. Local unit count is now145.

## Collection floor ordering

Profile Overview collection tiles and Holdings/Favorites sort by descending floorPriceUsd, after favorite pinning. Zero floors follow positive floors; unavailable/invalid floors follow known zero floors. Collection floors are not multiplied by the number of owned NFTs and token spot/totalValue fields never stand in for a collection floor. Each tile shows its USD floor or Floor unavailable.

The Alchemy adapter now retains collection.floorPrice with its explicit priceCurrency, falling back to contract.openSeaMetadata.floorPrice (documented by Alchemy as ETH). Conversion reuses the existing backend native/USD price helper, shares quotes across concurrent pages for 90 seconds, and gives up after five seconds without failing the NFT page. No additional per-NFT requests. Missing prices and unsupported currencies remain unknown. Monad Moralis, Solana Helius and Cardano Blockfrost adapters currently supply no collection floors, so those assets remain at the bottom unless their adapters gain floor coverage; this is not a spam classification.

Deploy backend-server.js, nft-source-page.js, public/nft-floor.js, public/index.html and public/profile-portfolio.jsx together (including the previous public/nft-metadata.js crash fix). No SQL change for sorting. Unit tests cover currency conversion, quote sharing, failed/missing/invalid values; browser fixture verifies collection order across chains, favorite pinning, Holdings order and unavailable floors at the bottom. Screenshots use fixture artwork/prices, not a live account.

Validation 2026-10-06:148 unit tests,5 targeted browser tests,syntax checks and6-script homepage precompile pass. A read-only live Ethereum adapter probe against a public sample wallet returned100 NFTs with96 reported floors and96 successful USD conversions. This verifies provider mapping/conversion, not the deployed UI or the user account.
