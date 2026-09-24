/* Curated deposit-address exchange assets, mirrored from Magic Money Wallet's
 * simpleswap-assets.ts. Codes are provider ticker + network, never symbol alone.
 * `wallet` is the ChainLens profile wallet family that can receive or refund the
 * asset (the wallet's addrKey); null means the user pastes an address. Logos come
 * from the Trust Wallet assets repo, as in chain-catalog.js; XMR has none there. */
(function (root, factory) {
  const assets = factory();
  if (typeof module === 'object' && module.exports) module.exports = assets;
  else root.ChainLensExchangeAssets = assets;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const TW = 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains';
  const list = [
    ['btc', 'btc', 'BTC', 'Bitcoin', 'bitcoin', 'bitcoin/info'],
    ['eth', 'eth', 'ETH', 'Ethereum', 'evm', 'ethereum/info'],
    ['sol', 'sol', 'SOL', 'Solana', 'solana', 'solana/info'],
    ['ada', 'ada', 'ADA', 'Cardano', 'cardano', 'cardano/info'],
    ['dot', 'dot', 'DOT', 'Polkadot', 'polkadot', 'polkadot/info'],
    ['usdc', 'eth', 'USDC', 'USD Coin (ERC-20)', 'evm', 'ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'],
    ['usdt', 'eth', 'USDT', 'Tether (ERC-20)', 'evm', 'ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7'],
    ['bnb', 'bsc', 'BNB', 'BNB Chain', 'evm', 'smartchain/info'],
    ['pol', 'polygon', 'POL', 'Polygon', 'evm', 'polygon/info'],
    ['avax', 'avaxc', 'AVAX', 'Avalanche', 'evm', 'avalanchec/info'],
    ['ltc', 'ltc', 'LTC', 'Litecoin', null, 'litecoin/info'],
    ['doge', 'doge', 'DOGE', 'Dogecoin', 'dogecoin', 'doge/info'],
    ['xmr', 'xmr', 'XMR', 'Monero', null, null],
    ['trx', 'trx', 'TRX', 'Tron', 'tron', 'tron/info'],
    ['xrp', 'xrp', 'XRP', 'XRP Ledger', null, 'ripple/info'],
  ].map(([ticker, network, label, name, wallet, logo]) => Object.freeze({
    ticker, network, label, name, wallet, key: `${ticker}:${network}`,
    logoUrl: logo ? `${TW}/${logo}/logo.png` : null,
  }));
  return Object.freeze(list);
});
