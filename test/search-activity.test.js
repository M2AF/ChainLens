const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const activityScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'search-activity.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('search warming follows visible ChainLens activity instead of a permanent timer', () => {
  assert.match(indexHtml, /<script src="\/search-activity\.js"><\/script>/);
  assert.match(activityScript, /document\.visibilityState !== 'visible'/);
  assert.match(activityScript, /10 \* 60 \* 1000/);
  assert.match(activityScript, /fetch\('\/api\/search\/activity'/);
  assert.doesNotMatch(activityScript, /workers\.dev/);
});
