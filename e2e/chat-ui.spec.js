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

async function installChatMocks(page) {
  let accepted = false;
  let nextMessageId = 20;

  await page.addInitScript(() => localStorage.setItem('cl_token', 'playwright-chat-token'));
  await page.route('**/api/profile', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ME) }));
  await page.route('**/api/profile/filters', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: {} }) }));
  await page.route('**/api/chat/status', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ eligible: true, walletLinked: true, socialLinked: true, giphyApiKey: 'public-e2e-key' }),
  }));
  await page.route('**/api/chat/world**', async route => {
    if (route.request().method() === 'POST') {
      const sent = route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ message: { id: ++nextMessageId, message_type: sent.type, content: sent.content, created_at: new Date().toISOString(), author: ME } }),
      });
    }
    const url = new URL(route.request().url());
    const messages = url.searchParams.has('after') ? [] : [{
      id: 1,
      message_type: 'text',
      content: 'Welcome to World Chat!',
      created_at: '2026-08-15T12:00:00.000Z',
      author: FRIEND,
    }];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ messages }) });
  });
  await page.route('**/api/chat/friends', async route => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ request: FRIEND }) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ friends: accepted ? [FRIEND] : [], incoming: accepted ? [] : [FRIEND], outgoing: [] }),
    });
  });
  await page.route('**/api/chat/friends/12/accept', route => {
    accepted = true;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
  await page.route(`**/api/chat/friends/${FRIEND.id}/messages**`, async route => {
    if (route.request().method() === 'POST') {
      const sent = route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ message: { id: ++nextMessageId, message_type: sent.type, content: sent.content, created_at: new Date().toISOString(), author: ME } }),
      });
    }
    const url = new URL(route.request().url());
    const messages = url.searchParams.has('after') ? [] : [{
      id: 8,
      message_type: 'text',
      content: 'Hey from your friend list.',
      created_at: '2026-08-15T12:05:00.000Z',
      author: FRIEND,
    }];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ messages }) });
  });
  await page.route('https://api.giphy.com/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: [{ id: 'e2e-gif', title: 'Celebration', images: { fixed_width: { url: 'https://media.giphy.com/media/e2e/giphy.gif', webp: 'https://media.giphy.com/media/e2e/giphy.webp' } } }] }),
  }));
  await page.route('https://media.giphy.com/**', route => route.fulfill({
    status: 200,
    contentType: 'image/gif',
    body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64'),
  }));
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

test('World Chat, friend acceptance, DMs, GIPHY, and profile ID work together', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await installChatMocks(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByTestId('chat-trigger').click();

  await expect(page.getByText('Welcome to World Chat!')).toBeVisible();
  await page.getByPlaceholder('Message World Chat').fill('Hello ChainLens');
  await page.getByLabel('Send message').click();
  await expect(page.getByText('Hello ChainLens')).toBeVisible();

  await page.getByRole('button', { name: /^Friends/ }).click();
  await expect(page.getByText(ME.id, { exact: true })).toBeVisible();
  await page.getByLabel("Friend's ChainLens ID").fill('c828bf80-3280-4c46-a8bb-503a442e0743');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Friend request sent')).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.getByRole('button', { name: /Chain Friend/ }).click();
  await expect(page.getByText('Hey from your friend list.')).toBeVisible();

  await page.getByLabel('Open GIPHY picker').click();
  await expect(page.getByText('Powered by GIPHY')).toBeVisible();
  await expect(page.getByTitle('Celebration')).toBeVisible();
  await page.getByTitle('Celebration').click();
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

test('mobile chat panel fits the viewport and retains both tabs', async ({ page }) => {
  await installChatMocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('nav').getByRole('button', { name: 'Chat', exact: true }).click();
  const panel = page.getByTestId('chat-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: 'World Chat' })).toBeVisible();
  await expect(panel.getByRole('button', { name: /^Friends/ })).toBeVisible();
  const box = await panel.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: 'test-results/chat-mobile.png', fullPage: true });
});
