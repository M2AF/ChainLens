# NFT image coverage results

2026-10-06. Local implementation. No commit, push, deployment, profile-row mutation or Magic Money source edits.

## Evidence

Read-only profile wallet lookup and live Blockfrost holdings found 62 Cardano assets. The revised adapter returns 52 NFT records over four pages, all with image candidates. Global supply and CIP metadata distinguish NFTs from fungible assets; owner quantity alone does not. Sampled CIP-68 metadata is already resolved by Blockfrost.

Old cloudflare-ipfs.com URLs fail DNS. Local ipfs.io/dweb.link requests return429; [the official IPFS notice](https://gatewaychanges.ipfs.io/) documents retirement of direct-fetch gateways. Claude supplied a separate read-only audit of42 unique image URIs. Its Range/MIME probes do not prove browser decode.

Independent Blockfrost gateway probes returned image206 responses in131-258ms for JAVELIN and Lil Sappys121. Pinata-first browser results were5/7. Blockfrost-first results were7/7 decoded, including Jukeboys and Lil Sappys121. Full Holdings and Spam checks subsequently decoded all52 returned NFT records:51 visible Holdings items plus1 filtered spam item. The local gallery uses real adapter records and image URLs with a mocked profile login. It is not a production authentication/deployment check.

## Implementation

- Cardano normalization supports CIP-25 URI arrays, image-typed files, definite-length CBOR hex text/bytes and validated CIDv0/base32/base58 CIDv1. Fungible PNG registry logos decode only in the tokens path. NFTs never substitute symbol-search artwork.
- Classification uses global supply, CIP25 and CIP68 NFT/reference/FT/RFT labels. Fungible CIP68 decimal/ticker metadata stays out of NFT results. Stake holdings paginate100/page; NFT responses process20 holdings/page through6 metadata workers with5second deadlines and one rate-limit retry. Holdings/metadata caches expire after5minutes. NFT mode avoids ADA price requests.
- Native IPFS uses Blockfrost, Pinata and Filebase. Working supplied gateways remain first; obsolete Cloudflare/ipfs.io/dweb.link/w3s.link gateway URLs are rewritten. Public gateway availability remains externally controlled.
- Profile, Scanner and details share near-viewport loading,6 active displayed image requests,12second candidate deadlines,9 bounded attempts and successful-source reuse. Actual displayed elements are scheduled, avoiding preloader/DOM duplicate requests. Loaded records remain through navigation; logout clears the session/loader.
- Metadata repair supports embedded JSON, bounded HTTPS, relative images, SVG image_data and typed files. Custom HTTPS resolves public IPv4 and pins the connection against DNS rebinding; redirects are revalidated and streamed bodies stop at1MiB. IPv6-only custom hosts fail closed. Document fetching uses node-fetch because native fetch ignores HTTPS agents.
- EVM work uses a shared6-worker deferred queue rather than silently dropping documents after12/page. Owner pages wait at most4.5seconds for document work; canonical token-only endpoints deliver deferred results. Last-good art survives transient failures. Documents expire after10minutes; normal5minute portfolio refresh remains.
- Monad Moralis fallback receives contract metadata repair while retaining its cursor namespace. Solana selects image-typed files, preserves json_uri and queues missing-image repair by exact mint/DAS ID. Changed metadata URIs invalidate old repairs.
- NFT details expose Retry artwork. Known EVM/Solana tokens retry metadata with30second backoff; EVM retry promotes foreground queue work. Endpoints accept token identities, never arbitrary proxy URLs. Downloads use decoded detail artwork.

Favorites, spam filtering, floor sorting and fresh Profile-to-Scanner ownership-cache reuse remain intact.

## Validation

- npm run check, six-script homepage precompile and git diff --check.
-176 Node tests: URI/CID/CBOR/CIP handling, stalls/request budget/cache, private redirects/body limits, ERC1155, last-good art,18 deferred documents and Solana identity/URI isolation.
-6 browser checks: cache/pagination reuse, retained artwork, floor/favorites/spam/banner behavior, stale refresh, stalled-image fallback and Retry without owner rescans.
- Local artifacts: .local-artifacts/nft-coverage/cardano-adapter.json, cardano-browser-after.json, cardano-after-desktop.png and cardano-after-mobile.png. Full-gallery results use cardano-full-browser.json and cardano-full-*.png.
- Runtime logs, audit artifacts and browser output are gitignored. No user wallet address was added to source fixtures or docs.

## Limits

Deploy frontend/backend together and verify the same tokens in production. Render production and the wallet embedded browser have not been validated for this release. No new OpenSea subscription/key, relay/storage/CDN or ERC4906 subscriber was added: the measured Cardano delivery failures resolve through gateway and normalization changes. Unsupported NFT discovery on Bitcoin/Polkadot/Tron/Dogecoin is separate work. Unavailable content retains a placeholder and Retry action; this is not universal coverage.

## Monad and Robinhood follow-up

The user committed the previous release as4a5794d and confirmed the public gallery improvement. This follow-up remains local and uncommitted.

Read-only Alchemy owner responses from two associated EVM addresses returned80 NFT records. Initial browser probes with5second candidate deadlines decoded58 and left22 unresolved. Direct contract reads separated unavailable delivery from absent metadata:

- Robinhood REDACTED8/9 and Macarune2 have valid token-specific on-chain artwork; existing repair resolves them. Peng3845/6572/8845 use correct contract metadata paths without the provider's erroneous `.json` suffix. Pinata delivery sometimes stalls, while the identical CID/path returns JSON through Blockfrost/Filebase.
- Ten Monad ERC1155 tokens across four contracts return an empty `uri`; five Robinhood ERC721 tokens in the Chog contract return an empty `tokenURI`. Alchemy supplies neither image candidates nor metadata for these15 records. No collection image or token-ID guess is substituted. These records expose missing-metadata status and a tooltip, retaining the existing Retry action for future publication.
- Monad's public RPC returned per-item request-limit errors in a53-call batch. Repair now serializes each network's reads in10-call chunks, spaces Monad bursts, and retries only unresolved transient/rate-limited identities through fixed documented alternate RPC endpoints. Successful reads and last-good artwork survive failures. Endpoint references: [Monad RPC documentation](https://docs.monad.xyz/reference/json-rpc/overview) and [Robinhood network documentation](https://docs.robinhood.com/chain/add-network-to-wallet/).
- Metadata documents prefer the measured Blockfrost gateway and fall back across up to three gateways for the exact content identity, with3.5second candidate deadlines and existing DNS-pinning, redirect and body-size protections.

The local Profile gallery using real repaired adapter data and mocked login decoded seven of the22 initially unresolved records: the six Robinhood tokens above and criptoejesus.nad on Monad. The15 empty-URI tokens remain placeholders with the explanatory tooltip. The initial5second probe is stricter than the production12second image deadline; the Nad name's successful recheck is not evidence of a new source repair.

Validation:179 Node tests, three image-retry/Scanner-cache browser regressions, syntax and homepage precompile checks. Screenshot and per-image outcomes: `.local-artifacts/nft-coverage/evm-after-desktop.png` and `evm-after-browser.json`; raw provider/RPC/audit artifacts are ignored. Production deployment and embedded-browser verification remain user-controlled next steps.
