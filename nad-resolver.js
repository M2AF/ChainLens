const { ensNormalize, namehash, Interface, ZeroAddress } = require('ethers');

// NNS mainnet deployment, NOT the testnet address in the older NNS SDK.
// https://docs.nad.domains/developers/contracts/contract-addresses
const NNS_MAINNET = '0xCc7a1bfF8845573dbF0B3b96e25B9b549d4a2eC7';
const RPC_URLS = ['https://rpc.monad.xyz', 'https://rpc1.monad.xyz'];
const abi = new Interface(['function getResolvedAddress(bytes32 node) view returns (address)']);
const failure = (statusCode, message) => Object.assign(new Error(message), { statusCode });

function normalizeNadName(raw) {
  if (typeof raw !== 'string' || raw.length > 255) throw failure(400, 'Enter a valid .nad name.');
  let name;
  try { name = ensNormalize(raw.trim()); } catch { throw failure(400, 'Enter a valid .nad name.'); }
  if (!name.endsWith('.nad') || name === '.nad' || name.split('.').some(label => !label)) throw failure(400, 'Enter a valid .nad name.');
  return name;
}

function createNadResolver({ fetchImpl = globalThis.fetch, rpcUrls = RPC_URLS, now = Date.now, timeoutMs = 5000 } = {}) {
  const cache = new Map(), pending = new Map();
  return async function resolve(rawName) {
    const domain = normalizeNadName(rawName);
    const cached = cache.get(domain);
    if (cached && cached.expires > now()) return { ...cached.value };
    if (pending.has(domain)) return pending.get(domain);
    const task = (async () => {
      const data = abi.encodeFunctionData('getResolvedAddress', [namehash(domain)]);
      for (const url of rpcUrls) {
        let address;
        try {
          const response = await fetchImpl(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(timeoutMs),
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: NNS_MAINNET, data }, 'latest'] }),
          });
          if (!response.ok) throw new Error('RPC unavailable');
          const payload = await response.json();
          if (payload.error || typeof payload.result !== 'string' || !/^0x[0-9a-f]{64}$/i.test(payload.result)) throw new Error('Invalid RPC response');
          [address] = abi.decodeFunctionResult('getResolvedAddress', payload.result);
        } catch { continue; }
        // No owner fallback: a registered name without an address is unresolved.
        if (address === ZeroAddress) throw failure(404, 'This .nad name has no resolved wallet address.');
        const value = { address, domain, chain: 'monad', service: 'Nad Name Service' };
        if (cache.size >= 256) cache.delete(cache.keys().next().value);
        cache.set(domain, { value, expires: now() + 60000 });
        return { ...value };
      }
      throw failure(503, 'Nad Name Service is temporarily unavailable. Try again.');
    })();
    pending.set(domain, task);
    try { return await task; } finally { pending.delete(domain); }
  };
}

function registerNadRoutes(app, resolver = createNadResolver()) {
  app.get('/api/resolve/nad/:name', async (req, res) => {
    try { res.json(await resolver(req.params.name)); }
    catch (error) { res.status(error.statusCode || 503).json({ error: error.message }); }
  });
}
module.exports = { createNadResolver, normalizeNadName, registerNadRoutes, NNS_MAINNET };
