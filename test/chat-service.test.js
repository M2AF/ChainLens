const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isUuid,
  orderedFriendPair,
  isGiphyMediaUrl,
  containsChatLink,
  normalizeChatContent,
  chatConversationKey,
  summarizeChatUnread,
  WORLD_CONVERSATION,
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

test('keys read cursors per conversation, matching cl_chat_reads', () => {
  // These strings are a stored schema, not an internal detail: the check
  // constraint in sql/cl_chat.sql only admits these two shapes, and changing
  // them would orphan every existing cursor.
  assert.equal(chatConversationKey(), WORLD_CONVERSATION);
  assert.equal(chatConversationKey(null), 'world');
  assert.equal(chatConversationKey(12), 'dm:12');
  assert.equal(chatConversationKey('12'), 'dm:12');
  for (const bad of [0, -1, 1.5, 'abc', Number.MAX_SAFE_INTEGER + 2]) {
    assert.throws(() => chatConversationKey(bad), /Invalid conversation/);
  }
});

test('summarizes unread as one badge payload, dropping read threads', () => {
  const a = 'ec18dcf5-3271-46fd-8029-41e5b2f39eed';
  const b = '3f2c6cb8-2a43-4b69-bf5e-099ef63be79f';
  const summary = summarizeChatUnread([
    { friendship_id: 7, friend_id: a, unread: 3 },
    // Read on another client — dropped rather than reported as a zero, so the
    // payload stays proportional to what is actually unread.
    { friendship_id: 8, friend_id: b, unread: 0 },
  ], 2);

  assert.deepEqual(summary, {
    pending_requests: 2,
    unread_direct: 3,
    conversations: [{ friendship_id: 7, friend_id: a, unread: 3 }],
  });
});

test('reading one conversation leaves the others unread', () => {
  const a = 'ec18dcf5-3271-46fd-8029-41e5b2f39eed';
  const b = '3f2c6cb8-2a43-4b69-bf5e-099ef63be79f';
  const before = summarizeChatUnread([
    { friendship_id: 7, friend_id: a, unread: 3 },
    { friendship_id: 8, friend_id: b, unread: 5 },
  ], 0);
  assert.equal(before.unread_direct, 8);

  // What the database returns after thread 7's cursor is advanced elsewhere —
  // reading a DM on ChainLens clears exactly that badge in the wallet, and
  // vice versa, while the other conversation is untouched.
  const after = summarizeChatUnread([
    { friendship_id: 7, friend_id: a, unread: 0 },
    { friendship_id: 8, friend_id: b, unread: 5 },
  ], 0);
  assert.equal(after.unread_direct, 5);
  assert.deepEqual(after.conversations, [{ friendship_id: 8, friend_id: b, unread: 5 }]);
});

test('treats a user with no friendships as having nothing unread', () => {
  assert.deepEqual(summarizeChatUnread([], 0), {
    pending_requests: 0, unread_direct: 0, conversations: [],
  });
  assert.deepEqual(summarizeChatUnread(null, undefined), {
    pending_requests: 0, unread_direct: 0, conversations: [],
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
