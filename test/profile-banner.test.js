const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateBanner } = require('../profile-banner');
test('banner updates support removal and raster images, reject unsafe schemes and oversized payloads', () => {
  assert.equal(validateBanner('').value, null);
  assert.equal(validateBanner('https://images.example/banner.jpg').value, 'https://images.example/banner.jpg');
  assert.equal(validateBanner('data:image/jpeg;base64,YWJj').value, 'data:image/jpeg;base64,YWJj');
  for (const value of [null, {}, 'javascript:alert(1)', 'http://images.example/x', 'data:image/svg+xml;base64,YWJj', 'data:image/jpeg;base64,<script>']) assert.equal(validateBanner(value).status, 400);
  assert.equal(validateBanner('a'.repeat(3 * 1024 * 1024)).status, 413);
});
