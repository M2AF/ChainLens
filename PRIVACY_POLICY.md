# Privacy Policy

**Last updated: June 2026**

ChainLens is a multi-chain blockchain scanner and wallet tool. This policy explains what data we collect, why we collect it, and how you can control it. We keep it short because we genuinely don't collect much.

---

## 1. What we collect

### Wallet addresses
When you scan a wallet or link one to your profile, we store the public blockchain address (e.g. `0xabc…` or a Solana/Cardano address). We never ask for, store, or transmit private keys or seed phrases — those never leave your device.

### Profile information (optional)
If you sign in with Google or connect a social account, we receive your display name, profile picture URL, and email address from that provider. This is used only to populate your ChainLens profile and is never sold or shared.

### Authentication tokens
We issue a signed JWT when you log in. It expires after 30 days and is stored in your browser. It contains only your internal user ID — no personal information.

### What we do NOT collect
- Private keys or seed phrases
- IP addresses (we do not log requests)
- Browser fingerprints or tracking pixels
- Payment or financial information
- Any data from wallets you scan anonymously (no account required to scan)

---

## 2. How we use your data

- Display your linked wallets and profile across ChainLens surfaces
- Fetch on-chain balances, NFTs, and transaction history for addresses you provide
- Allow you to sign in consistently across sessions

We do not use your data for advertising, profiling, or any purpose beyond operating the service.

---

## 3. Third-party services

ChainLens uses the following external APIs to fetch blockchain data. Your wallet address is sent to these services as part of normal read queries. None of them receive your name, email, or any personally identifying information.

| Service | Used for | Privacy policy |
|---|---|---|
| Alchemy | EVM balances, tokens, NFTs | [alchemy.com](https://www.alchemy.com/policies/privacy-policy) |
| Moralis | NFT data, Monad | [moralis.io](https://moralis.io/privacy-policy/) |
| Helius | Solana balances & tokens | [helius.dev](https://www.helius.dev/privacy) |
| Blockfrost | Cardano data | [blockfrost.io](https://blockfrost.io/privacy) |
| CoinGecko | Prices & market data | [coingecko.com](https://www.coingecko.com/en/privacy) |
| Supabase | Profile & wallet storage | [supabase.com](https://supabase.com/privacy) |
| Google OAuth | Optional social login | [google.com](https://policies.google.com/privacy) |

---

## 4. Data storage & security

Profile data and linked wallet addresses are stored in Supabase, hosted on AWS infrastructure in the US. Data is protected by row-level security policies — you can only read and modify your own records.

---

## 5. MagicMoney Wallet extension & desktop app

The MagicMoney browser extension and desktop wallet are self-custody tools. Your seed phrase and private keys are encrypted on your device and are never transmitted to ChainLens or any server. The extension uses `chrome.storage.local` for the encrypted mnemonic; the desktop app uses your operating system's native keychain (Windows Credential Manager / macOS Keychain / libsecret on Linux). Neither product sends your keys anywhere.

---

## 6. Your rights

- **Delete your account** — email us and we will remove all stored profile data and linked wallets from Supabase within 7 days
- **Export your data** — request a copy of everything we hold about you
- **Unlink a wallet** — remove any wallet address from your profile at any time through the app
- **Use anonymously** — scanning any wallet address requires no account

---

## 7. Changes to this policy

We may update this policy as the product evolves. The "last updated" date at the top will always reflect the most recent revision. Continued use of ChainLens after a change constitutes acceptance of the updated policy.

---

## Contact

Questions or data deletion requests: **guildfordking@gmail.com**
