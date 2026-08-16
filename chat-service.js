'use strict';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHAT_LINK_RE = /(?:\b[a-z][a-z0-9+.-]*:\/\/[^\s<]+|\bmailto:[^\s<]+|\bwww\.[^\s<]+|\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?:[/?#][^\s<]*)?)/i;

const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value.trim());

const orderedFriendPair = (first, second) => {
  if (!isUuid(first) || !isUuid(second)) throw new Error('Enter a valid ChainLens ID');
  const a = first.trim().toLowerCase();
  const b = second.trim().toLowerCase();
  if (a === b) throw new Error('You cannot add yourself as a friend');
  return a < b ? [a, b] : [b, a];
};

const isGiphyMediaUrl = (value) => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && (host === 'giphy.com' || host.endsWith('.giphy.com'));
  } catch {
    return false;
  }
};

const containsChatLink = (value) => typeof value === 'string' && CHAT_LINK_RE.test(value);

const normalizeChatContent = (type, value, { allowLinks = true } = {}) => {
  const messageType = type === 'gif' ? 'gif' : 'text';
  if (typeof value !== 'string') throw new Error('Message content must be text');
  const content = value.trim();

  if (messageType === 'text') {
    if (!content) throw new Error('Write a message first');
    if (content.length > 500) throw new Error('Messages can be up to 500 characters');
    if (!allowLinks && containsChatLink(content)) {
      throw new Error('Links can only be sent in direct messages');
    }
  } else {
    if (content.length > 2048 || !isGiphyMediaUrl(content)) {
      throw new Error('Choose a GIF from the GIPHY picker');
    }
  }

  return { message_type: messageType, content };
};

module.exports = { isUuid, orderedFriendPair, isGiphyMediaUrl, containsChatLink, normalizeChatContent };
