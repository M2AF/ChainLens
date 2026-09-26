const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'asset-filter-key.js'), 'utf8'), context);
const { convertHiddenToSpam, mergeEntries } = context.window.assetFilterKey;

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
