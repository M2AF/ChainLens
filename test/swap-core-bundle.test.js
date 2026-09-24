/**
 * public/swap-core.js is GENERATED from Magic Money's shared swap code. A hand
 * edit, or a partial copy, would let ChainLens validate swaps with rules the
 * wallet does not use; this fails when the file no longer matches its manifest.
 * (Magic Money's own drift test compares the manifest with its sources.)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dir = path.join(__dirname, '..', 'public');

test('swap-core.js matches the hash its generator recorded', () => {
  const bundle = fs.readFileSync(path.join(dir, 'swap-core.js'));
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'swap-core.manifest.json'), 'utf8'));
  assert.equal(crypto.createHash('sha256').update(bundle).digest('hex'), manifest.bundleSha256,
    'swap-core.js was edited by hand or copied partially; regenerate it in Magic Money with npm run build:swap-core');
  assert.ok(Object.keys(manifest.sources).every(p => p.startsWith('src/shared/')));
});

test('the bundle exposes the checks the page and server rely on', () => {
  const core = require('../public/swap-core.js');
  for (const name of [
    'checkQuoteBeforeSigning', 'approveSwap', 'selectFromCandidates', 'classifyQuoteFee', 'decideSwapPolicy',
    'mapStatusForProvider', 'applyStatusReport', 'recordSwapNotSent', 'swapCapability', 'SWAP_FEE_BENEFICIARIES',
  ]) assert.ok(core[name] !== undefined, `${name} missing from swap-core.js`);
});
