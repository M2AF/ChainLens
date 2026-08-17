const { test, expect } = require('@playwright/test');

const ME = {
  id: 'ec18dcf5-3271-46fd-8029-41e5b2f39eed',
  display_name: 'criptoejesus',
  avatar_url: null,
  provider: 'google',
  cl_wallets: [{ id: 'wallet-1', chain: 'evm', address: '0x01faf6dfc230d755141d84d7cb980dd68f5efe13', watch_only: false }],
  cl_linked_accounts: [{ id: 'social-1', provider: 'google', display_name: 'criptoejesus' }],
};

const FRIEND = {
  friendship_id: 12,
  id: '3f2c6cb8-2a43-4b69-bf5e-099ef63be79f',
  display_name: 'Chain Friend',
  avatar_url: null,
};

// A second friend, used to prove that reading ONE thread does not clear the
// badge on another.
const FRIEND_B = {
  friendship_id: 13,
  id: 'c828bf80-3280-4c46-a8bb-503a442e0743',
  display_name: 'Second Friend',
  avatar_url: null,
};

// Someone whose request is still pending, so the badge covers both halves of
// what it counts (requests and unread DMs) at the same time.
const REQUESTER = '9b1f0c22-5d8e-41a7-8f3b-6c2d4e5a7b19';

async function installChatMocks(page, { worldMessageCount = 1, delayedWorldGif = false, unreadFixture = false } = {}) {
  // The unread fixture starts with both friendships already accepted — unread
  // only exists on an accepted friendship, so that is the state worth testing.
  let accepted = unreadFixture;
  let nextMessageId = Math.max(20, worldMessageCount + 10);
  const worldMessages = Array.from({ length: worldMessageCount }, (_, index) => ({
    id: index + 1,
    message_type: 'text',
    content: index === 0 ? 'Welcome to World Chat!' : `World message ${index + 1}`,
    created_at: new Date(Date.parse('2026-08-15T12:00:00.000Z') + index * 60_000).toISOString(),
    author: index % 2 ? ME : FRIEND,
  }));
  if (delayedWorldGif) {
    worldMessages[worldMessages.length - 1] = {
      ...worldMessages[worldMessages.length - 1],
      message_type: 'gif',
      content: 'https://media.giphy.com/media/scroll-test/giphy.gif',
    };
  }
  const directMessages = [{
    id: 8,
    message_type: 'text',
    content: 'Hey from your friend list.',
    created_at: '2026-08-15T12:05:00.000Z',
    author: FRIEND,
  }];

  // ── Server-side read state, modelled the way sql/cl_chat.sql does ──────────
  // One store per thread plus a cursor per conversation. Unread is "messages
  // from the other person with an id above my cursor", and the cursor only ever
  // moves forward — the two properties the wallet and the website both depend
  // on for their badges to agree.
  const threads = {
    [FRIEND.id]: { friendship_id: FRIEND.friendship_id, messages: directMessages },
    [FRIEND_B.id]: {
      friendship_id: FRIEND_B.friendship_id,
      messages: unreadFixture
        ? [
            { id: 30, message_type: 'text', content: 'Second thread, first line.', created_at: '2026-08-15T12:10:00.000Z', author: FRIEND_B },
            { id: 31, message_type: 'text', content: 'Second thread, second line.', created_at: '2026-08-15T12:11:00.000Z', author: FRIEND_B },
          ]
        : [],
    },
  };
  const readCursors = {};
  const friendById = { [FRIEND.id]: FRIEND, [FRIEND_B.id]: FRIEND_B };

  // Which friendships are accepted right now — unread is only ever counted for
  // those, exactly as cl_chat_unread does.
  const acceptedFriends = () => [
    ...(accepted ? [FRIEND] : []),
    ...(unreadFixture ? [FRIEND_B] : []),
  ];

  const unreadFor = (friendId) => {
    const thread = threads[friendId];
    if (!thread || !acceptedFriends().some(friend => friend.id === friendId)) return 0;
    const cursor = readCursors[`dm:${thread.friendship_id}`] || 0;
    // Own messages are never unread — the same exclusion the SQL makes.
    return thread.messages.filter(message => message.id > cursor && message.author.id !== ME.id).length;
  };

  await page.addInitScript(() => localStorage.setItem('cl_token', 'playwright-chat-token'));
  await page.route('**/api/profile', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ME) }));
  await page.route('**/api/profile/filters', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: {} }) }));
  await page.route('**/api/chat/status', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ eligible: true, walletLinked: true, socialLinked: true, giphyApiKey: 'public-e2e-key' }),
  }));
  await page.route('**/api/chat/world**', async route => {
    const method = route.request().method();
    if (method === 'POST') {
      const sent = route.request().postDataJSON();
      const message = { id: ++nextMessageId, message_type: sent.type, content: sent.content, created_at: new Date().toISOString(), author: ME };
      worldMessages.push(message);
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ message }),
      });
    }
    if (method === 'DELETE') {
      const messageId = Number(new URL(route.request().url()).pathname.split('/').pop());
      const index = worldMessages.findIndex(message => message.id === messageId && message.author.id === ME.id);
      if (index >= 0) worldMessages.splice(index, 1);
      return route.fulfill({ status: index >= 0 ? 200 : 404, contentType: 'application/json', body: JSON.stringify(index >= 0 ? { success: true, message_id: messageId } : { error: 'Message not found' }) });
    }
    const url = new URL(route.request().url());
    const after = Number(url.searchParams.get('after') || 0);
    const messages = url.searchParams.has('after') ? worldMessages.filter(message => message.id > after) : worldMessages;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ messages }) });
  });
  await page.route('**/api/chat/friends', async route => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ request: FRIEND }) });
    }
    const incoming = unreadFixture
      ? [{ ...FRIEND, friendship_id: 14, id: REQUESTER, display_name: 'Pending Requester' }]
      : (accepted ? [] : [FRIEND]);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ friends: acceptedFriends(), incoming, outgoing: [] }),
    });
  });

  // GET /api/chat/unread — the one aggregate the badge polls.
  await page.route('**/api/chat/unread', route => {
    const conversations = Object.keys(threads)
      .map(friendId => ({
        friendship_id: threads[friendId].friendship_id,
        friend_id: friendId,
        unread: unreadFor(friendId),
      }))
      .filter(row => row.unread > 0);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        pending_requests: unreadFixture ? 1 : (accepted ? 0 : 1),
        unread_direct: conversations.reduce((total, row) => total + row.unread, 0),
        conversations,
      }),
    });
  });

  // POST /api/chat/read — monotonic, exactly like cl_chat_mark_read.
  await page.route('**/api/chat/read', route => {
    const sent = route.request().postDataJSON();
    const friend = sent.friend_id ? friendById[sent.friend_id] : null;
    if (sent.friend_id && !friend) {
      return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Direct messages are only available between friends' }) });
    }
    const conversation = friend ? `dm:${friend.friendship_id}` : 'world';
    readCursors[conversation] = Math.max(readCursors[conversation] || 0, Number(sent.last_read_id) || 0);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ conversation, last_read_id: readCursors[conversation] }),
    });
  });
  await page.route('**/api/chat/friends/12/accept', route => {
    accepted = true;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
  await page.route('**/api/chat/friends/*/messages**', async route => {
    const url = new URL(route.request().url());
    // .../friends/<friendId>/messages[/<messageId>]
    const segments = url.pathname.split('/').filter(Boolean);
    const friendId = segments[segments.indexOf('friends') + 1];
    const thread = threads[friendId];
    if (!thread) {
      return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Direct messages are only available between friends' }) });
    }
    const method = route.request().method();

    if (method === 'POST') {
      const sent = route.request().postDataJSON();
      const message = { id: ++nextMessageId, message_type: sent.type, content: sent.content, created_at: new Date().toISOString(), author: ME };
      thread.messages.push(message);
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ message }),
      });
    }
    if (method === 'DELETE') {
      const messageId = Number(segments[segments.length - 1]);
      const index = thread.messages.findIndex(message => message.id === messageId && message.author.id === ME.id);
      if (index >= 0) thread.messages.splice(index, 1);
      return route.fulfill({ status: index >= 0 ? 200 : 404, contentType: 'application/json', body: JSON.stringify(index >= 0 ? { success: true, message_id: messageId } : { error: 'Message not found' }) });
    }
    const after = Number(url.searchParams.get('after') || 0);
    const messages = url.searchParams.has('after') ? thread.messages.filter(message => message.id > after) : thread.messages;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ messages }) });
  });
  await page.route('https://api.giphy.com/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: Array.from({ length: 30 }, (_, index) => ({
      id: `e2e-gif-${index + 1}`,
      title: index === 0 ? 'Celebration' : `Celebration ${index + 1}`,
      images: { fixed_width: { url: `https://media.giphy.com/media/e2e-${index + 1}/giphy.gif`, webp: `https://media.giphy.com/media/e2e-${index + 1}/giphy.webp` } },
    })) }),
  }));
  await page.route('https://media.giphy.com/**', async route => {
    if (route.request().url().includes('/scroll-test/')) {
      await new Promise(resolve => setTimeout(resolve, 350));
      return route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="300"><rect width="420" height="300" fill="#06b6d4"/><text x="210" y="155" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#082f49">Newest GIF</text></svg>',
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'image/gif',
      body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64'),
    });
  });
  return {
    addIncomingWorldMessage(content) {
      const message = {
        id: ++nextMessageId,
        message_type: 'text',
        content,
        created_at: new Date().toISOString(),
        author: FRIEND,
      };
      worldMessages.push(message);
      return message;
    },
    /** Stand in for "the other client read this thread", e.g. the wallet. */
    markReadElsewhere(friend) {
      const thread = threads[friend.id];
      const newest = thread.messages.reduce((max, message) => Math.max(max, message.id), 0);
      readCursors[`dm:${thread.friendship_id}`] = newest;
    },
    unreadFor,
    readCursors,
  };
}

test('signed-out chat button opens the account prompt', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/');
  await page.getByTestId('chat-trigger').click();
  await expect(page.getByTestId('chat-panel')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign in to chat' })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('chat opens at the newest message and offers a scroll-to-bottom control', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const chatMock = await installChatMocks(page, { worldMessageCount: 45, delayedWorldGif: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByTestId('chat-trigger').click();

  const feed = page.getByTestId('world-chat-feed');
  const newestGif = feed.locator('img[alt^="GIF from"]');
  await expect(newestGif).toBeVisible();
  await expect.poll(() => newestGif.evaluate(image => image.complete && image.naturalHeight > 0)).toBe(true);
  const distanceFromBottom = () => feed.evaluate(element => element.scrollHeight - element.scrollTop - element.clientHeight);
  await expect.poll(distanceFromBottom).toBeLessThanOrEqual(2);

  await feed.evaluate(element => element.scrollTo({ top: 0, behavior: 'auto' }));
  await expect(page.getByRole('button', { name: 'Scroll to bottom' })).toBeVisible();
  chatMock.addIncomingWorldMessage('New message while reading history');
  await expect(feed.getByText('New message while reading history')).toHaveCount(1, { timeout: 5000 });
  await expect.poll(() => feed.evaluate(element => element.scrollTop)).toBeLessThanOrEqual(2);
  await expect(page.getByRole('button', { name: 'Scroll to bottom' })).toBeVisible();
  await page.screenshot({ path: 'test-results/chat-scroll-to-bottom.png', fullPage: true });

  await page.getByRole('button', { name: 'Close chat' }).click();
  await page.getByTestId('chat-trigger').click();
  await expect.poll(distanceFromBottom).toBeLessThanOrEqual(2);
  await feed.evaluate(element => element.scrollTo({ top: 0, behavior: 'auto' }));
  await expect(page.getByRole('button', { name: 'Scroll to bottom' })).toBeVisible();
  await page.getByRole('button', { name: 'Scroll to bottom' }).click();
  await expect.poll(distanceFromBottom).toBeLessThanOrEqual(2);
  await expect(page.getByRole('button', { name: 'Scroll to bottom' })).toBeHidden();
  expect(pageErrors).toEqual([]);
});

test('World Chat, friend acceptance, DMs, GIPHY, and profile ID work together', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await installChatMocks(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByTestId('chat-trigger').click();

  await expect(page.getByText('Welcome to World Chat!')).toBeVisible();
  await page.getByPlaceholder('Message World Chat · no links').fill('https://chainlensnft.info/docs');
  await page.getByLabel('Send message').click();
  await expect(page.getByText('Links can only be sent in direct messages.')).toBeVisible();

  await page.getByPlaceholder('Message World Chat · no links').fill('Hello ChainLens');
  await page.getByLabel('Send message').click();
  await expect(page.getByText('Hello ChainLens')).toBeVisible();
  const ownWorldMessage = page.getByTestId('world-chat-feed').locator('[data-message-id]').filter({ hasText: 'Hello ChainLens' });
  page.once('dialog', dialog => dialog.accept());
  await ownWorldMessage.getByLabel('Delete message').click();
  await expect(ownWorldMessage).toHaveCount(0);
  await expect(page.getByText('Message deleted')).toBeVisible();

  await page.getByRole('button', { name: /^Friends/ }).click();
  await expect(page.getByText(ME.id, { exact: true })).toBeVisible();
  await page.getByLabel("Friend's ChainLens ID").fill('c828bf80-3280-4c46-a8bb-503a442e0743');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Friend request sent')).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.getByRole('button', { name: /Chain Friend/ }).click();
  await expect(page.getByText('Hey from your friend list.')).toBeVisible();

  const directLink = 'https://chainlensnft.info/docs';
  await page.getByPlaceholder(`Message ${FRIEND.display_name}`).fill(directLink);
  await page.getByLabel('Send message').click();
  await expect(page.getByRole('link', { name: directLink })).toHaveAttribute('href', directLink);
  const ownDirectMessage = page.getByTestId('direct-message-feed').locator('[data-message-id]').filter({ hasText: directLink });
  page.once('dialog', dialog => dialog.accept());
  await ownDirectMessage.getByLabel('Delete message').click();
  await expect(ownDirectMessage).toHaveCount(0);

  const giphyRequestPromise = page.waitForRequest(request => request.url().startsWith('https://api.giphy.com/v1/gifs/'));
  await page.getByLabel('Open GIPHY picker').click();
  const giphyRequest = await giphyRequestPromise;
  expect(new URL(giphyRequest.url()).searchParams.get('limit')).toBe('30');
  await expect(page.getByText('Powered by GIPHY')).toBeVisible();
  await expect(page.getByText('30 GIFs')).toBeVisible();
  await expect(page.locator('button[title^="Celebration"]')).toHaveCount(30);
  await expect(page.getByRole('button', { name: 'Celebration', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Celebration', exact: true }).click();
  await expect(page.getByTestId('direct-message-feed').locator('img[alt^="GIF from"]')).toBeVisible();
  await page.getByLabel('Open GIPHY picker').click();
  await page.screenshot({ path: 'test-results/chat-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Close chat' }).click();
  await page.locator('.fixed.top-4.right-4 .switch-bg').click();
  await expect(page.getByText('Dark', { exact: true })).toBeVisible();
  await page.getByTestId('chat-trigger').click();
  await page.screenshot({ path: 'test-results/chat-desktop-dark.png', fullPage: true });

  await page.getByRole('button', { name: 'Close chat' }).click();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.getByText(ME.id, { exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('opening Chat after SimpleSwap keeps Messenger fully inside the viewport', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await installChatMocks(page);
  await page.route('https://simpleswap.io/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>SimpleSwap</title>' }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  await page.getByTestId('simpleswap-trigger').click();
  await expect(page.locator('#simpleswap-frame')).toBeVisible();
  await page.getByTestId('chat-trigger').click();

  const panel = page.getByTestId('chat-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Messenger' })).toBeVisible();
  await expect(page.locator('#simpleswap-frame')).toBeHidden();
  const box = await panel.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(900);
  await page.screenshot({ path: 'test-results/chat-after-simpleswap.png', fullPage: true });
  expect(pageErrors).toEqual([]);
});

test('mobile chat panel fits the viewport and retains both tabs', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await installChatMocks(page, { worldMessageCount: 30 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  // Name is "Chat", or "Chat — N friend requests…" once the badge has counts.
  await page.locator('nav').getByRole('button', { name: /^Chat($| —)/ }).click();
  const panel = page.getByTestId('chat-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: 'World Chat' })).toBeVisible();
  await expect(panel.getByRole('button', { name: /^Friends/ })).toBeVisible();
  const box = await panel.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  const feed = page.getByTestId('world-chat-feed');
  await expect.poll(() => feed.evaluate(element => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeLessThanOrEqual(2);
  await feed.evaluate(element => element.scrollTo({ top: 0, behavior: 'auto' }));
  const scrollButton = page.getByRole('button', { name: 'Scroll to bottom' });
  await expect(scrollButton).toBeVisible();
  const buttonBox = await scrollButton.boundingBox();
  expect(buttonBox.x).toBeGreaterThanOrEqual(box.x);
  expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(box.x + box.width);
  await page.screenshot({ path: 'test-results/chat-mobile.png', fullPage: true });
  expect(pageErrors).toEqual([]);
});

test('unread badge is server state, shared with the wallet', async ({ page }) => {
  // Covers the background poll cadence, so it needs longer than the default.
  test.setTimeout(90_000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const chatMock = await installChatMocks(page, { unreadFixture: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  // One unread line from Chain Friend, two from Second Friend, one pending
  // request — 4 before anything is opened, and the count is the SERVER's.
  const trigger = page.getByTestId('chat-trigger');
  const badge = page.getByTestId('chat-trigger-badge');
  await expect(badge).toHaveText('4');
  await expect(trigger).toHaveAttribute('aria-label', /1 friend request, 3 unread messages/);

  await trigger.click();
  await page.getByRole('button', { name: /^Friends/ }).click();

  // Per-friend counts come from the same aggregate, so the list agrees with the
  // badge without one request per thread.
  await expect(page.getByRole('button', { name: /Second Friend, 2 unread messages/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Chain Friend, 1 unread message$/ })).toBeVisible();

  // Reading Second Friend's thread clears ONLY that thread.
  await page.getByRole('button', { name: /Second Friend/ }).click();
  await expect(page.getByText('Second thread, second line.')).toBeVisible();
  await expect.poll(() => chatMock.unreadFor(FRIEND_B.id), { timeout: 10_000 }).toBe(0);
  await expect(badge).toHaveText('2', { timeout: 10_000 });
  // Chain Friend's thread is untouched — a read cursor is per conversation.
  expect(chatMock.unreadFor(FRIEND.id)).toBe(1);
  await page.getByRole('button', { name: 'Back to friends' }).click();
  await expect(page.getByRole('button', { name: /Chain Friend, 1 unread message$/ })).toBeVisible();

  // ── The other direction: the wallet reads the remaining thread on the same
  // account, and THIS page's badge drops on its own next background poll. No
  // local read state is involved on either side.
  chatMock.markReadElsewhere(FRIEND);
  await expect(badge).toHaveText('1', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: /^Chain Friend$/ })).toBeVisible();

  expect(pageErrors).toEqual([]);
});
