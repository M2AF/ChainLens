const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isUuid,
  orderedFriendPair,
  isGiphyMediaUrl,
  containsChatLink,
  normalizeChatContent,
} = require('../chat-service');

const A = 'ec18dcf5-3271-46fd-8029-41e5b2f39eed';
const B = '3f2c6cb8-2a43-4b69-bf5e-099ef63be79f';

test('validates and canonicalizes ChainLens IDs for friendship keys', () => {
  assert.equal(isUuid(A), true);
  assert.equal(isUuid('not-an-id'), false);
  assert.deepEqual(orderedFriendPair(A.toUpperCase(), B), [B, A]);
  assert.throws(() => orderedFriendPair(A, A), /yourself/i);
});

test('accepts bounded text messages and rejects empty or oversized text', () => {
  assert.deepEqual(normalizeChatContent('text', '  hello world  '), {
    message_type: 'text',
    content: 'hello world',
  });
  assert.throws(() => normalizeChatContent('text', '   '), /message first/i);
  assert.throws(() => normalizeChatContent('text', 'x'.repeat(501)), /500/);
});

test('blocks links in World Chat while allowing them in direct messages', () => {
  for (const value of [
    'Visit https://chainlensnft.info',
    'Try www.chainlensnft.info/chat',
    'Open chainlensnft.info',
    'Email mailto:hello@chainlensnft.info',
  ]) {
    assert.equal(containsChatLink(value), true);
    assert.throws(
      () => normalizeChatContent('text', value, { allowLinks: false }),
      /direct messages/i,
    );
  }
  assert.equal(containsChatLink('Version 1.2 is ready... say hello!'), false);
  assert.deepEqual(normalizeChatContent('text', 'https://chainlensnft.info', { allowLinks: true }), {
    message_type: 'text',
    content: 'https://chainlensnft.info',
  });
});

test('only accepts HTTPS GIPHY media URLs for GIF messages', () => {
  const url = 'https://media2.giphy.com/media/abc123/giphy.gif';
  assert.equal(isGiphyMediaUrl(url), true);
  assert.deepEqual(normalizeChatContent('gif', url), {
    message_type: 'gif',
    content: url,
  });
  assert.equal(isGiphyMediaUrl('https://example.com/not-giphy.gif'), false);
  assert.equal(isGiphyMediaUrl('http://media.giphy.com/media/abc/giphy.gif'), false);
  assert.throws(() => normalizeChatContent('gif', 'https://example.com/x.gif'), /GIPHY picker/);
});
