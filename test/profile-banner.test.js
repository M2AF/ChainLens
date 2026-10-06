const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateBanner } = require('../profile-banner');
const { profileUpdateError } = require('../profile-banner');
test('banner updates support removal and raster images, reject unsafe schemes and oversized payloads', () => {
  assert.equal(validateBanner('').value, null);
  assert.equal(validateBanner('https://images.example/banner.jpg').value, 'https://images.example/banner.jpg');
  assert.equal(validateBanner('data:image/jpeg;base64,YWJj').value, 'data:image/jpeg;base64,YWJj');
  for (const value of [null, {}, 'javascript:alert(1)', 'http://images.example/x', 'data:image/svg+xml;base64,YWJj', 'data:image/jpeg;base64,<script>']) assert.equal(validateBanner(value).status, 400);
  assert.equal(validateBanner('a'.repeat(3 * 1024 * 1024)).status, 413);
});
test('missing banner schema is actionable without leaking database details', () => {
  assert.equal(profileUpdateError({code:'PGRST204',message:"Could not find the 'banner_url' column"},{banner_url:'image'}).code,'BANNER_SCHEMA_MISSING');
  assert.equal(profileUpdateError({code:'42703',message:'column banner_url does not exist'},{banner_url:'image'}).status,503);
  assert.deepEqual(profileUpdateError({code:'42703',message:'private column'},{display_name:'name'}),{status:500,error:'Failed to update profile'});
});
