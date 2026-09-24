/* Curated deposit-address exchange assets, mirrored from Magic Money Wallet's
 * simpleswap-assets.ts. Codes are provider ticker + network, never symbol alone. */
(function (root, factory) {
  const assets = factory();
  if (typeof module === 'object' && module.exports) module.exports = assets;
  else root.ChainLensExchangeAssets = assets;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const list = [
    ['btc', 'btc', 'BTC', 'Bitcoin'], ['eth', 'eth', 'ETH', 'Ethereum'],
    ['sol', 'sol', 'SOL', 'Solana'], ['ada', 'ada', 'ADA', 'Cardano'],
    ['dot', 'dot', 'DOT', 'Polkadot'], ['usdc', 'eth', 'USDC', 'USD Coin (ERC-20)'],
    ['usdt', 'eth', 'USDT', 'Tether (ERC-20)'], ['bnb', 'bsc', 'BNB', 'BNB Chain'],
    ['pol', 'polygon', 'POL', 'Polygon'], ['avax', 'avaxc', 'AVAX', 'Avalanche'],
    ['ltc', 'ltc', 'LTC', 'Litecoin'], ['doge', 'doge', 'DOGE', 'Dogecoin'],
    ['xmr', 'xmr', 'XMR', 'Monero'], ['trx', 'trx', 'TRX', 'Tron'],
    ['xrp', 'xrp', 'XRP', 'XRP Ledger'],
  ].map(([ticker, network, label, name]) => Object.freeze({ ticker, network, label, name, key: `${ticker}:${network}` }));
  return Object.freeze(list);
});
