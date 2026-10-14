const { formatUnits, Interface } = require('ethers');
const { CHAIN_MAP } = require('./public/chain-catalog');
const { isHash, explorerUrl } = require('./public/search-entities');
const RPCS = {
  ethereum: 'https://ethereum-rpc.publicnode.com', base: 'https://mainnet.base.org', arbitrum: 'https://arb1.arbitrum.io/rpc', optimism: 'https://mainnet.optimism.io', polygon: 'https://polygon-bor-rpc.publicnode.com', avalanche: 'https://api.avax.network/ext/bc/C/rpc', blast: 'https://rpc.blast.io', gnosis: 'https://rpc.gnosischain.com', monad: 'https://rpc.monad.xyz', abstract: 'https://api.mainnet.abs.xyz', apechain: 'https://rpc.apechain.com/http', robinhood: 'https://rpc.mainnet.chain.robinhood.com', arc: 'https://rpc.mainnet.arc.io', ronin: 'https://api.roninchain.com/rpc', soneium: 'https://rpc.soneium.org', worldchain: 'https://worldchain-mainnet.g.alchemy.com/public', zora: 'https://rpc.zora.energy', hyperevm: 'https://rpc.hyperliquid.xyz/evm', solana: 'https://api.mainnet-beta.solana.com',
};
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const multiToken = new Interface(['event TransferSingle(address indexed operator,address indexed from,address indexed to,uint256 id,uint256 value)', 'event TransferBatch(address indexed operator,address indexed from,address indexed to,uint256[] ids,uint256[] values)']);
function createTransactionSearch({ fetchImpl = globalThis.fetch } = {}) {
  async function request(url, options = {}) {
    const res = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(7000) });
    if (res.status === 404) return null;
    if (!res.ok) throw fail(503, 'Transaction provider is unavailable. Try again.');
    return res.json();
  }
  async function rpc(chain, method, params) {
    const body = await request(RPCS[chain], { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    if (!body || body.error || !Object.hasOwn(body, 'result')) throw fail(503, 'Transaction provider is unavailable. Try again.');
    return body.result;
  }
  async function search({ chain, hash }) {
    if (typeof chain !== 'string' || !Object.hasOwn(CHAIN_MAP, chain) || typeof hash !== 'string' || !isHash(chain, hash)) throw fail(400, 'Choose a supported network and valid transaction hash.');
    if (!RPCS[chain] && !['cardano', 'bitcoin'].includes(chain)) throw fail(400, 'Transaction lookup is not available on this network.');
    hash = chain === 'solana' ? hash : ['bitcoin', 'cardano'].includes(chain) ? hash.replace(/^0x/i, '').toLowerCase() : '0x' + hash.replace(/^0x/i, '').toLowerCase();
    const result = { kind: 'transaction', chain, hash, explorerUrl: explorerUrl(chain, 'transaction', hash), transfers: [], source: 'Public RPC' };
    try {
      if (CHAIN_MAP[chain].family === 'evm') {
        const [tx, receipt] = await Promise.all([rpc(chain, 'eth_getTransactionByHash', [hash]), rpc(chain, 'eth_getTransactionReceipt', [hash])]);
        if (!tx && !receipt) return { ...result, state: 'not-found' };
        if (!tx || tx.hash?.toLowerCase() !== hash) throw fail(503, 'Transaction provider returned an inconsistent result.');
        result.from = tx.from; result.to = tx.to; result.value = formatUnits(BigInt(tx.value || '0x0'), 18); result.symbol = CHAIN_MAP[chain].native;
        if (!receipt) return { ...result, state: 'pending' };
        if (receipt.transactionHash?.toLowerCase() !== hash || !['0x0', '0x1'].includes(receipt.status)) throw fail(503, 'Transaction provider returned an inconsistent result.');
        result.state = receipt.status === '0x1' ? 'successful' : 'failed'; result.block = String(BigInt(receipt.blockNumber));
        if (receipt.gasUsed && receipt.effectiveGasPrice) result.fee = formatUnits(BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice), 18);
        const topic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
        for (const log of (receipt.logs || []).slice(0, 200)) {
          if (!/^0x[a-f0-9]{40}$/i.test(log.address || '')) continue;
          if (log.topics?.[0]?.toLowerCase() !== topic) {
            try {
              const parsed = multiToken.parseLog(log);
              if (!parsed) continue;
              const ids = parsed.name === 'TransferSingle' ? [parsed.args[3]] : parsed.args[3];
              const quantities = parsed.name === 'TransferSingle' ? [parsed.args[4]] : parsed.args[4];
              if (ids.length !== quantities.length) continue;
              const count = Math.min(ids.length, 20-result.transfers.length);
              for (let i=0;i<count;i++) result.transfers.push({type:'NFT ERC1155',contract:log.address,from:parsed.args[1],to:parsed.args[2],tokenId:ids[i].toString(),amountRaw:quantities[i].toString()});
            } catch {}
            if (result.transfers.length >= 20) break;
            continue;
          }
          if (![3, 4].includes(log.topics.length) || !log.topics.every(t => /^0x[a-f0-9]{64}$/i.test(t))) continue;
          if (log.topics.length === 3 && !/^0x[a-f0-9]{64}$/i.test(log.data || '')) continue;
          result.transfers.push({ type: log.topics.length === 4 ? 'NFT' : 'Token', contract: log.address, from: '0x' + log.topics[1].slice(-40), to: '0x' + log.topics[2].slice(-40), amountRaw: log.topics.length === 4 ? '1' : BigInt(log.data).toString(), ...(log.topics.length === 4 ? { tokenId: BigInt(log.topics[3]).toString() } : {}) });
          if (result.transfers.length === 20) break;
        }
      } else if (chain === 'solana') {
        const tx = await rpc(chain, 'getTransaction', [hash, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
        if (!tx) {
          const s = await rpc(chain, 'getSignatureStatuses', [[hash], { searchTransactionHistory: true }]);
          return { ...result, state: s?.value?.[0] ? s.value[0].err ? 'failed' : 'pending' : 'not-found' };
        }
        if (!tx.transaction?.signatures?.includes(hash) || !tx.meta) throw fail(503, 'Transaction provider returned an inconsistent result.');
        result.state = tx.meta.err ? 'failed' : 'successful'; result.block = String(tx.slot); result.fee = formatUnits(BigInt(tx.meta.fee), 9); result.symbol = 'SOL';
        for (const ix of [...(tx.transaction.message?.instructions || []), ...(tx.meta.innerInstructions || []).flatMap(group => group.instructions || [])]) {
          const info = ix.parsed?.info;
          if (ix.parsed?.type === 'transfer' || ix.parsed?.type === 'transferChecked') result.transfers.push({ type: ix.program === 'system' ? 'SOL' : 'Token', from: info?.source, to: info?.destination, amountRaw: String(info?.lamports ?? info?.amount ?? info?.tokenAmount?.amount ?? ''), contract: info?.mint || null });
          if (result.transfers.length >= 20) break;
        }
      } else if (chain === 'bitcoin') {
        const tx = await request(`https://mempool.space/api/tx/${hash}`);
        if (!tx) return { ...result, state: 'not-found', source: 'mempool.space' };
        if (tx.txid !== hash) throw fail(503, 'Transaction provider returned an inconsistent result.');
        result.state = tx.status?.confirmed ? 'successful' : 'pending'; result.block = tx.status?.block_height == null ? null : String(tx.status.block_height); result.fee = formatUnits(BigInt(tx.fee), 8); result.symbol = 'BTC'; result.source = 'mempool.space';
        result.transfers = (tx.vout || []).slice(0, 20).map(out => ({ type: 'BTC output', to: out.scriptpubkey_address || null, amountRaw: String(out.value) }));
      } else {
        const rows = await request('https://api.koios.rest/api/v1/tx_info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _tx_hashes: [hash], _inputs: false, _metadata: false, _assets: true }) });
        if (!Array.isArray(rows)) throw fail(503, 'Transaction provider returned an inconsistent result.');
        const tx = rows.find(row => row.tx_hash === hash);
        if (!tx) return { ...result, state: 'not-found', source: 'Koios' };
        result.state = tx.valid_contract === false ? 'failed' : 'successful'; result.block = String(tx.block_height); result.fee = formatUnits(BigInt(tx.fee), 6); result.symbol = 'ADA'; result.source = 'Koios';
        result.transfers = (tx.outputs || []).slice(0, 20).map(out => ({ type: 'ADA output', to: typeof out.payment_addr === 'object' ? out.payment_addr.bech32 : out.payment_addr, amountRaw: String(out.value), assets: (out.asset_list || []).slice(0, 10).map(a => ({ policy: a.policy_id, name: a.asset_name, quantity: String(a.quantity) })) }));
      }
      return result;
    } catch (error) { throw error.statusCode ? error : fail(503, 'Transaction provider is unavailable. Try again.'); }
  }
  return { search };
}
module.exports = { createTransactionSearch, RPCS };
