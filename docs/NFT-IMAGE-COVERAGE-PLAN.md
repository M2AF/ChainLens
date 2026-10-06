# ChainLens NFT image coverage plan

Prepared 2026-10-06; implementation authorized. See NFT-IMAGE-COVERAGE-RESULTS.md for changes and validation. No new subscriptions, commits, deployment or wallet edits.

## Evidence and priority

The supplied screenshot shows a large concentration of placeholders on Cardano, with smaller gaps in Monad and Robinhood collection mosaics. Examples visible include JAVELIN CM22 #02141, ADA (Handle BG), Ikigai #3851, Burukatz Vol 02 #3548, Jukeboys #2788, Lil Sappys #121 and NPC Army #1290. Treat names as leads: record policy/asset unit or contract/token ID before investigating; names are not unique identities. The screenshot establishes a pattern, not the HTTP or metadata cause of each failure.

Current source review at Git HEAD `92915f3` found:

| Layer | Current behavior | Coverage gap |
|---|---|---|
| Cardano adapter in backend-server.js | Joins image arrays; chooses the first candidate; rewrites IPFS to cloudflare-ipfs.com; treats unknown strings of length >=46 as IPFS; may search token-symbol artwork | No alternate candidates in the response; loose URI recognition can misclassify data; logo/web-page URLs can be mistaken for NFT art. No explicit files/CIP-68 handling here. |
| Alchemy adapter in nft-source-page.js | Preserves several preview/full/original URLs and invokes metadata repair | Drops metadata/media provenance, document base URI and animation fields needed for targeted repair. |
| nft-metadata-repair.js | Cross-checks ERC token URI, expands ERC-1155 IDs, repairs IPFS/Arweave metadata, retains last-good repair | Excludes HTTPS and embedded JSON metadata. Twelve new documents/page limits coverage with no deferred continuation. Repair applies to the Alchemy path, not every adapter. |
| Solana adapter | DAS file/CDN/link candidates | Any file with cdn_uri can be selected, even if not an image; JSON URI is not preserved for repair. |
| public/nft-image.js | Normalizes IPFS/Arweave and tries two IPFS gateways | Replaces supplied IPFS gateway, unlike wallet code; cannot resolve metadata-relative images using their document base. |
| NftArtwork in public/profile-portfolio.jsx | Changes candidate on img error | No per-candidate stall deadline, load/decode status or successful-source cache. Preloader has a deadline but does not drive the rendered img. |
| Discovery/session | Shared paginated Profile/Scanner cache; five-minute revalidation and retained assets | Existing image failures do not trigger targeted repair. Bitcoin/Polkadot/Tron/Dogecoin NFT routes are intentionally empty, which is a separate discovery limitation. |

Magic Money source was inspected read-only. Reuse its supplied-gateway preservation, per-image deadline, near-viewport activation, reserved card dimensions, preview/full separation and stale-preview invalidation patterns. Its gallery performance document records fixture results, not live ChainLens performance. OpenSea-inspired presentation alone does not provide OpenSea-level sourcing coverage.

## Intended data flow

Existing ownership adapter -> normalized token/media record -> cached preview/original candidates -> shared browser image loader -> targeted repair for failed/suspect tokens -> update existing Profile/Scanner/detail records in place.

Retain loaded portfolio records through navigation. Do not rescan every wallet or query every provider just because an image failed. Keep favorites, spam decisions, sorting, account separation and linked-wallet scope unchanged. Missing artwork never implies spam.

## Pass 1: audit and Cardano repair

1. Capture a reproducible baseline from the user's holdings, using the screenshot collections and working controls from each affected chain. Count tokens, not mosaic groups. Record discovered assets separately from display success.
2. For each failure record canonical identity, adapter, metadata standard/URI, candidate host and media type, browser outcome, and whether metadata contains a viable image. Distinguish: discovery unavailable, missing metadata, malformed URI, unreachable gateway, blocked delivery, unsupported media, stale/wrong art, and loading-budget exhaustion. Keep signed URL queries/API keys and complete wallet addresses out of routine logs. Browser img errors alone cannot tell us HTTP status; use bounded server probes when needed.
3. Extract Cardano media normalization into a tested adapter. Keep all credible artwork candidates, join CIP-25 URI fragments, validate bare CIDs instead of guessing from string length, resolve file entries with image MIME types, and decode registry base64 logos only in the appropriate fungible-token path. Never replace a missing NFT's art with a symbol-search result or collection logo.
4. Verify provider-resolved CIP-68 metadata; where absent, resolve the reference-token datum through the chain/provider adapter. Check Cardano asset classification and stake-asset pagination separately: wallet quantity ==1 is not sufficient evidence of NFT status, and missing discovered assets cannot be fixed with an image fallback.
5. Preserve the original URI and supplied gateway, with bounded alternative gateways. Test actual delivery before declaring a gateway healthy or permanently broken.

Acceptance: every screenshot Cardano example is mapped to its real asset identity and a documented result; every example with verified available artwork renders correctly in Profile, Scanner and details. Items without retrievable content keep an honest placeholder and a recorded reason. Report coverage gain against the same baseline, without claiming every IPFS object is recoverable.

## Pass 2: one media model and reliable image loading

Extend current adapters and loader instead of adding independent gallery pipelines. Keep legacy image/thumbnailUrl/imageSources for compatibility, but introduce a normalized media record with:

- Canonical chain/network and token identity; source provider and metadata URI/base.
- Ordered candidates with URL, preview/original/poster role, MIME hint, source and verification time.
- Metadata generation/document fingerprint, selected successful candidate, repair status and last-good source.

Port wallet loader behavior into the existing NftArtwork: 12-second starting per-candidate deadline, bounded total attempts, decode/load/error states and a stable accessible final placeholder. Cap actual active image work, not just the preloader: current mounted img elements bypass the preloader's six-worker budget. Prioritize visible and nearby cards; warm remaining thumbnails in a bounded background queue. Once artwork is activated, retain it through tab navigation rather than repeatedly destroying loaded elements.

Use token-verified provider previews first for grids and full artwork for details/downloads. Preserve working provider gateways; try configured public alternatives only on failure. Normalize ipfs://, ar://, valid bare CIDs, path/subdomain gateway formats and relative image paths against the metadata document. Use last-good source while repairing; switch only after replacement decodes. Share the successful source and resolution generation across Profile, Scanner, mosaic and detail views.

Acceptance: a hanging first candidate falls back, metadata changes reset retries, large galleries have bounded active requests, grid/list and detail agree on token art, and navigation produces no extra NFT ownership calls for fresh cached targets. Test browser CSP/mixed-content/DNS failures separately from metadata errors, including the Magic Money embedded browser where practical.

## Pass 3: targeted metadata and provider fallback

| Ecosystem | Primary enrichment | Targeted escalation |
|---|---|---|
| EVM, including Monad/Robinhood | Existing owner indexer plus token-specific preview/original fields | Read tokenURI/uri; resolve IPFS/Arweave, embedded JSON and bounded HTTPS metadata; then an independent supported token-metadata provider if needed. Preserve Monad's provider-specific pagination. |
| Solana | Helius DAS image-typed files/CDN/links | Preserve content.json_uri; fetch token-specific metadata or getAsset by correct mint/DAS asset ID. Do not treat video CDN files as still images. |
| Cardano | Blockfrost-resolved token metadata, CIP-25/CIP-68 adapter | Reference datum or token-specific metadata/media candidates; chain-specific fallback only after verified failure. OpenSea is not the Cardano fallback. |
| Other chains | Explicit capability report | New NFT indexers are separate discovery work; do not present unsupported indexing as a confirmed empty portfolio. |

Metadata parsing should preserve image, image_url, image_data and relevant files/animation fields. Use GIF/SVG/raster images where supported. For video/audio/HTML/3D, prefer a provider poster and clearly distinguish unsupported preview types; do not pass arbitrary HTML to img or execute it in the app. Custom poster generation is later work with its own cost and isolation decision.

Extend direct HTTPS fetching only behind URL/redirect/DNS checks that exclude credentials, private/local destinations and excessive response sizes. Resolve URLs from validated token records, never expose an unrestricted URL proxy. Bound body reads as well as headers; validate MIME/decodability before caching a success.

Replace the silent twelve-document cutoff with a bounded deferred repair queue. Prioritize visible failures, favorites and valuable collections without starving other legitimate holdings. Coalesce duplicate work by token identity and metadata generation. Start with existing providers; evaluate server-side OpenSea token metadata only on supported chains and with verified credentials/quota. No assumed universal chain coverage or browser API keys. A genuine missing result, rate limit and provider outage must remain different outcomes.

Acceptance: missing original metadata, stale indexer art, same-URI mutable metadata, ERC-1155 {id}, embedded JSON/SVG, relative URLs, CIP arrays/datums and Solana mixed-media files have fixtures plus representative live checks. Wrong-token artwork is a release blocker even if it loads successfully.

## Pass 4: freshness, delivery cache and rollout

Extend the existing last-good and session caches. Key media resolution by token identity plus metadata generation/content URI. Immutable media can have long cache lifetimes; mutable HTTP/IPNS metadata needs conditional/background revalidation. Keep loaded art while refreshing; never permanently cache a transport failure as “no artwork.” Add bounded negative backoff and a targeted Retry artwork action. Use ERC-4906 update signals where available; continue periodic/on-demand checks for collections that do not emit them.

Only if measured failures still come from delivery/hotlink restrictions or excessive original sizes, add a controlled media relay/thumbnail cache. Prototype against existing hosting first; persistent object storage/CDN, resizing libraries and operating costs need an explicit implementation decision. Do not couple NFT media work to the New Listings collector. Avoid duplicate resizing when providers already supply good previews.

Release in small verified steps: audit/Cardano -> shared loader/model -> targeted repair -> optional relay. For each step capture before/after desktop/mobile screenshots of the same token set, correct-art verification against token metadata, success rate per chain/media type, visible first-art latency, fallback latency, bytes transferred, provider calls and unresolved reason counts. Keep raw all-asset coverage and legitimate/non-spam coverage as separate denominators. Include real user failures, ordinary working NFTs and synthetic bad metadata. Broad coverage targets are set after the baseline; a higher percentage alone cannot hide broken known-good collections.

Local checks do not prove Render production or embedded-browser behavior. Verify the deployed frontend/backend together after the user-authorized release. No commits/deployments are part of this planning task.

## Implementation touchpoints

Extend backend-server.js adapters, nft-source-page.js, nft-metadata-repair.js, public/nft-image.js, public/profile-portfolio.jsx and public/nft-session.js. Extract Cardano normalization and general metadata fetching into small tested helpers as needed. Add adapter/URI/loader tests and extend existing Profile/Scanner Playwright cases. Leave Magic Money source unchanged in this ChainLens task.

## Official references checked

- [Cardano CIP-25 media metadata](https://cips.cardano.org/cip/CIP-0025) and [CIP-68 datum metadata](https://cips.cardano.org/cip/CIP-0068): chain-specific metadata representation.
- [IPFS addressing](https://docs.ipfs.tech/how-to/address-ipfs-on-web/): native, path/subdomain and IPNS forms; gateway availability does not imply content availability.
- [OpenSea metadata standards](https://docs.opensea.io/docs/metadata-standards) and [media fields](https://docs.opensea.io/docs/media-and-traits): contract-returned JSON, ERC-1155 ID expansion and media representation.
- [OpenSea token metadata endpoint](https://docs.opensea.io/reference/get_nft_metadata): token-specific enrichment candidate, subject to supported chains and key access.
- [Alchemy token metadata](https://www.alchemy.com/docs/reference/nft-api-endpoints/nft-api-endpoints/nft-metadata-endpoints/get-nft-metadata-v-3): cached/original/thumbnail/PNG variants and metadata fields.
- [Helius getAsset examples](https://demo.helius.dev/get-assets): standard/compressed asset identity and DAS lookup.
- [ERC-4906](https://eips.ethereum.org/EIPS/eip-4906): metadata update notifications.
