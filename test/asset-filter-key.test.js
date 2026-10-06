const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'asset-filter-key.js'), 'utf8'), context);
const { convertHiddenToSpam, mergeEntries } = context.window.assetFilterKey;
test('favorites share NFT identity and retain unfavorite tombstones independently of spam', () => {
  const key = 'favorite:mainnet:' + context.window.assetFilterKey.canonicalNftKey('Base', '0xABC', '1');
  const merged = mergeEntries({ [key]: { s: 'f', t: 1 }, 'base:n:0xabc:1': { s: 's', t: 1 } }, { [key]: { s: 'u', t: 2 } });
  assert.equal(merged[key].s, 'u'); assert.equal(merged['base:n:0xabc:1'].s, 's');
  assert.equal(Object.keys(context.window.assetFilterKey.sanitizeEntries({ wrong: { s: 'f', t: 1 } })).length, 0);
});

test('old hidden decisions become spam and outrank the synced hide', () => {
  const entries = {
    'base:t:0xaaa': { s: 'h', t: 5000 },
    'base:t:0xbbb': { s: 's', t: 200 },
    'base:t:0xccc': { s: 'a', t: 300 },
  };
  const converted = convertHiddenToSpam(entries, 1000);
  assert.equal(converted['base:t:0xaaa'].s, 's');
  assert.equal(converted['base:t:0xaaa'].t, 5001);
  assert.deepEqual(converted['base:t:0xbbb'], entries['base:t:0xbbb']);
  assert.deepEqual(converted['base:t:0xccc'], entries['base:t:0xccc']);
  assert.equal(mergeEntries(entries, converted)['base:t:0xaaa'].s, 's');
  assert.equal(convertHiddenToSpam(converted, 9000), converted);
});
