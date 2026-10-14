# Nad Name Service search

`.nad` names are recognized in Search as Monad domains. A result card resolves
the wallet, labels the source/network, exposes the full address with Copy, and
opens Scanner with that resolved EVM address. This avoids resolving twice.
The domain result still works when the separate web-search provider fails.
Direct `.nad` input in the Scanner uses the same `/api/resolve/nad/:name` route.
Existing ENS, Unstoppable, SNS and ADA Handle dispatch remains unchanged.

Implementation files: `nad-resolver.js`, `backend-server.js`,
`public/chain-catalog.js`, `public/search-page.jsx`, `public/index.html`.
Tests: `test/nad-resolver.test.js`, `e2e/nad-search.spec.js`.
No added dependency, API key, schema change, signing or wallet source change.

The resolver uses existing ethers ENS normalization/namehash and reads
`getResolvedAddress(bytes32)` from NNS on Monad mainnet at
`0xCc7a1bfF8845573dbF0B3b96e25B9b549d4a2eC7`. Zero-address records are 404;
RPC failures are 503, malformed names 400. Each public-RPC attempt has a five
second timeout, with one fallback; concurrent identical requests share one
lookup. Successful results cache for 60 seconds, capped at 256 names.
The older SDK's `0x3019...` deployment is testnet and is not used.

Sources checked October 13, 2026:
- [NNS contract addresses](https://docs.nad.domains/developers/contracts/contract-addresses)
- [NNS normalization](https://docs.nad.domains/developers/integrating-into-your-dapps/name-processing)
- [Direct contract queries](https://docs.nad.domains/developers/integrating-into-your-dapps/query-contract-directly)
- [Monad network information](https://docs.monad.xyz/developer-essentials/network-information)

A read-only live mainnet probe resolved `criptoejesus.nad` to
`0x01faF6DFc230d755141D84d7cB980dd68f5Efe13`; the RPC reports chain ID 143.
This verifies that name record, not ownership of a ChainLens profile.

Local syntax checks and 11 JSX precompiled assets pass; 234 Node tests and
10 affected browser cases pass without retries.
Browser validation covers Copy, reusable Scan input, direct Scanner dispatch,
mobile fit and missing/outage results, alongside existing profile search.
Final results: `.local-artifacts/nad-final-{unit,e2e}.log`.
Desktop/mobile screenshots: `.local-artifacts/nad-search/`.
This work is local; production needs the backend and frontend deployed together.

## Suggested next capabilities (not implemented)

1. Exact token/collection lookup by contract, mint or Cardano policy ID, with
   explicit chain and separate wallet/token/collection choices when ambiguous.
   Reuse existing market/Scanner sources rather than treating a symbol as identity.
2. Transaction hash or supported explorer URL: network, status, transfers and
   link to source. Ask for network when a bare hash is ambiguous.
3. Workflow phrases such as “bridge Monad to Solana”, “stake SOL” and “lend USDC
   on Base”: rank matching tools and open their appropriate screens. App discovery
   and actual route availability must remain separate.
4. Public identity discovery by display name or domain, matching ChainLens
   profiles only through wallets their owners chose to make public. Use
   forward-confirmed reverse names to label wallets without asserting ownership.

Token/collection and transaction lookup are the highest-priority additions:
they connect search to ChainLens's asset inspection and existing data paths.
