const { test, expect: baseExpect } = require('@playwright/test');
const expect = baseExpect.configure({ timeout: 15_000 });
test.setTimeout(60_000);
test.use({ actionTimeout: 15_000 });
const ME = { id: 'ec18dcf5-3271-46fd-8029-41e5b2f39eed', display_name: 'criptoejesus', avatar_url: null, banner_url: null, cl_wallets: [], cl_linked_accounts: [] };
const FRIEND = { id: '3f2c6cb8-2a43-4b69-bf5e-099ef63be79f', friendship_id: 12, display_name: 'Chain Friend', avatar_url: null };
const OTHER = { id: 'c828bf80-3280-4c46-a8bb-503a442e0743', display_name: 'World Guest', avatar_url: null };
async function mocks(page, signedIn = true) {
  const fulfill = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (signedIn) await page.addInitScript(() => localStorage.setItem('cl_token', 'social-test'));
  let friends = [FRIEND], outgoing = [], incoming = [];
  const beats = [];
  await page.route('**/api/profile', route => fulfill(route, ME));
  await page.route('**/api/profile/themes', route => fulfill(route, { eligible: true, entries: {} }));
  await page.route('**/api/profile/filters', route => fulfill(route, { entries: {} }));
  await page.route('**/api/profiles/*', route => {
    const id = new URL(route.request().url()).pathname.split('/').pop();
    return fulfill(route, id === ME.id ? ME : id === FRIEND.id ? FRIEND : { error: 'No ChainLens profile has that ID' }, [ME.id, FRIEND.id].includes(id) ? 200 : 404);
  });
  await page.route('**/api/profiles/*/favorites', route => fulfill(route,{assets:[],hidden:false,total:0,nextOffset:null}));
  await page.route('**/api/profiles/*/relationship', route => {
    const id = new URL(route.request().url()).pathname.split('/')[3];
    const row=friends.find(f=>f.id===id);
    return fulfill(route,{blocked:false,interactionAllowed:true,friendship:row?{friendship_id:row.friendship_id,status:'accepted'}:null});
  });
  await page.route('**/api/chat/status', route => fulfill(route, { eligible: true, walletLinked: true, socialLinked: true }));
  await page.route('**/api/chat/unread', route => fulfill(route, { pending_requests: 0, unread_direct: 0, conversations: [] }));
  await page.route('**/api/chat/read', route => fulfill(route, { success: true }));
  await page.route('**/api/chat/presence', route => {
    if (route.request().method() === 'POST') { beats.push(route.request().postDataJSON()); return fulfill(route, { success: true }); }
    return fulfill(route, { people: [{ ...FRIEND, online: true, in_world: false }, { ...OTHER, online: true, in_world: true }] });
  });
  await page.route('**/api/chat/world**', route => fulfill(route, { messages: Array.from({ length: 50 }, (_, i) => ({ id: i + 1, message_type: 'text', content: `World message ${i}`, created_at: new Date().toISOString(), author: OTHER })) }));
  await page.route('**/api/chat/friends', route => {
    if (route.request().method() === 'POST') { outgoing = [{ ...OTHER, friendship_id: 13 }]; return fulfill(route, { success: true }, 201); }
    return fulfill(route, { friends, incoming, outgoing });
  });
  await page.route('**/api/chat/friends/**', route => {
    if (route.request().method() === 'DELETE') { friends = []; outgoing = []; return fulfill(route, { success: true }); }
    if (route.request().url().endsWith('/accept')) { friends = [FRIEND]; incoming = []; return fulfill(route, { success: true }); }
    return fulfill(route, { messages: [{ id: 100, message_type: 'text', content: 'Private hello', created_at: new Date().toISOString(), author: FRIEND }] });
  });
  return { beats, setIncoming: () => { friends = []; incoming = [FRIEND]; } };
}
test('ID and profile-link search sits above Featured Apps and opens a public deep link', async ({ page }) => {
  await mocks(page, false); await page.goto('/');
  await page.locator('#chainlens-search').fill(ME.id);
  await page.getByRole('search').getByRole('button', { name: 'Search', exact: true }).click();
  const result = page.getByTestId('profile-search-result'); await expect(result.getByText(ME.display_name)).toBeVisible();
  const featured = page.getByRole('heading', { name: 'Featured apps' }); await expect(featured).toBeVisible();
  expect((await result.boundingBox()).y).toBeLessThan((await featured.boundingBox()).y);
  await result.getByRole('button').click(); await expect(page).toHaveURL(new RegExp(ME.id + '$'));
  await expect(page.getByRole('heading', { name: ME.display_name, exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading',{name:'Favorited NFTs',exact:true})).toBeVisible();
  await page.screenshot({ path: 'test-results/public-profile-desktop.png', fullPage: true });
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Search', exact: true }).click();
  await page.locator('#chainlens-search').fill(`https://www.chainlensnft.info/${ME.id}`);
  await page.getByRole('search').getByRole('button', { name: 'Search', exact: true }).click(); await expect(result.getByText(ME.display_name)).toBeVisible();
});
test('missing profile displays a helpful error and navigation supports browser history', async ({ page }) => {
  await mocks(page, false); await page.goto('/' + OTHER.id); await expect(page.getByRole('alert')).toHaveText('No ChainLens profile has that ID');
  await page.goto('/' + ME.id); await expect(page.getByRole('heading', { name: ME.display_name })).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('chat-trigger').click(); await expect(page).toHaveURL(/\/chat$/); await page.goBack();
  await expect(page.getByRole('heading', { name: ME.display_name })).toBeVisible();
});
test('two-panel chat, name actions, friendship changes and pop-out preserve draft and scroll', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const fixture = await mocks(page); await page.setViewportSize({ width: 1440, height: 900 }); await page.goto('/chat');
  const people = page.getByRole('complementary', { name: 'People' }); await expect(people.getByText('In World Chat · 1')).toBeVisible();
  await expect(people.getByText('Online', { exact: true })).toBeVisible();
  const feed = page.getByTestId('world-chat-feed'); await expect(feed.getByText('World message 49')).toBeVisible();
  await page.getByPlaceholder('Message World Chat · no links').fill('World draft');
  await feed.evaluate(el => el.scrollTop = 120);
  await page.getByRole('button', { name: 'Pop out chat' }).click();
  await expect(page.getByPlaceholder('Message World Chat · no links')).toHaveValue('World draft');
  await expect.poll(() => feed.evaluate(el => el.scrollTop)).toBe(120);
  await page.getByLabel('Pin chat', { exact: true }).click();
  await page.getByRole('button', { name: 'Open chat page' }).click(); await expect(page).toHaveURL(/\/chat$/);
  await expect.poll(() => feed.evaluate(el => el.scrollTop)).toBe(120);
  await people.getByRole('button', { name: 'Chain Friend', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Message', exact: true }).click();
  await expect(page.getByTestId('direct-message-feed').getByText('Private hello')).toBeVisible();
  await page.getByPlaceholder('Message Chain Friend').fill('Private draft');
  await people.getByRole('button', { name: 'World Chat', exact: true }).click(); await expect(page.getByPlaceholder('Message World Chat · no links')).toHaveValue('World draft');
  await people.getByRole('button', { name: 'Message Chain Friend', exact: true }).click(); await expect(page.getByPlaceholder('Message Chain Friend')).toHaveValue('Private draft');
  await page.screenshot({ path: 'test-results/chat-page-desktop.png', fullPage: true });
  await people.getByRole('button', { name: 'Chain Friend', exact: true }).click(); await page.getByRole('menuitem', { name: 'Remove Friend' }).click();
  await expect(people.getByRole('button', { name: 'Message Chain Friend' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await people.getByRole('button', { name: 'World Guest', exact: true }).click(); await page.getByRole('menuitem', { name: 'Add Friend' }).click();
  await expect(page.getByRole('menuitem', { name: 'Cancel Request' })).toBeVisible();
  expect(fixture.beats.some(row => row.in_world)).toBe(true); expect(errors).toEqual([]);
});
test('mobile chat switches people panel and retains conversation in pop-out', async ({ page }) => {
  await mocks(page); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/chat');
  const panel = page.getByTestId('chat-panel'); await expect(page.getByTestId('world-chat-feed')).toBeVisible();
  await page.getByRole('button', { name: 'People', exact: true }).click(); await expect(page.getByRole('complementary', { name: 'People' })).toBeVisible();
  await page.getByRole('button', { name: 'Message Chain Friend', exact: true }).click(); await expect(page.getByTestId('direct-message-feed')).toBeVisible();
  await page.screenshot({ path: 'test-results/chat-page-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Pop out chat' }).click();
  await expect(page.getByTestId('direct-message-feed')).toBeVisible(); const box = await panel.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/chat-popout-mobile.png', fullPage: true });
});
test('incoming request menu supports accepting and declining', async ({ page }) => {
  const f = await mocks(page); f.setIncoming(); await page.goto('/chat');
  const people = page.getByRole('complementary', { name: 'People' }); await people.getByRole('button', { name: 'Chain Friend', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Decline Request' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Accept Request' }).click(); await expect(people.getByRole('button', { name: 'Message Chain Friend' })).toBeVisible();
});
test('world-message menu stays visible, copies a profile link, and public friend profile opens a DM', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']); await mocks(page); await page.goto('/chat');
  const feed = page.getByTestId('world-chat-feed'); const name = feed.getByRole('button', { name: 'World Guest', exact: true }).last();
  await name.click(); const menu = page.getByRole('menu', { name: 'World Guest options' }); await expect(menu).toBeVisible();
  const box = await menu.boundingBox(); expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(720);
  await menu.getByRole('menuitem', { name: 'Copy Profile Link' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`https://www.chainlensnft.info/${OTHER.id}`);
  await page.keyboard.press('Escape'); await expect(menu).toBeHidden();
  const people = page.getByRole('complementary', { name: 'People' }); await people.getByRole('button', { name: 'Chain Friend', exact: true }).click();
  await page.getByRole('menuitem', { name: 'View Profile' }).click(); await expect(page).toHaveURL(new RegExp(FRIEND.id + '$'));
  await expect(page.getByRole('heading', { name: FRIEND.display_name })).toBeVisible();
  await page.getByRole('region', { name: 'Public profile', exact:true }).getByRole('button', { name: 'Message Chain Friend', exact: true }).click(); await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByTestId('direct-message-feed').getByText('Private hello')).toBeVisible();
});
test('presence failures are labelled unavailable and unknown profile searches keep Featured Apps', async ({ page }) => {
  await mocks(page); await page.route('**/api/chat/presence', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Presence unavailable"}' }));
  await page.goto('/chat'); await expect(page.getByRole('complementary', { name: 'People' }).getByText('Status unavailable', { exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Search', exact: true }).click();
  await page.locator('#chainlens-search').fill(OTHER.id); await page.getByRole('search').getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByTestId('profile-search-result').getByText('No ChainLens profile has that ID')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Featured apps' })).toBeVisible();
});
