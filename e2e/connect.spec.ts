import { test, expect, request, APIRequestContext } from '@playwright/test';

const PASSWORD = 'Password123!';

/** A second member created straight through the API (same backend, via the Vite proxy). */
async function memberViaApi(baseURL: string, email: string, displayName: string, placeQuery: string) {
  const api: APIRequestContext = await request.newContext({ baseURL });
  const reg = await api.post('/api/v1/auth/register', { data: { email, password: PASSWORD, displayName, dateOfBirth: '1997-04-04' } });
  expect(reg.ok()).toBeTruthy();
  const id = (await reg.json()).data.user.id as string;
  const places = await (await api.get('/api/v1/locations/search', { params: { q: placeQuery, kinds: 'city' } })).json();
  const loc = await api.put('/api/v1/users/me/location', { data: { mode: 'place', placeId: places.data[0].id } });
  expect(loc.ok()).toBeTruthy();
  return { api, id };
}

test('signed-out visitors are sent to login and returned afterwards', async ({ page, baseURL }) => {
  const email = `return.${Date.now()}@example.com`;
  const api = await request.newContext({ baseURL });
  await api.post('/api/v1/auth/register', { data: { email, password: PASSWORD, displayName: 'Returner', dateOfBirth: '1996-01-01' } });

  await page.goto('/matches');
  await expect(page).toHaveURL(/\/login\?redirect=(%2F|\/)matches$/);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/matches$/);
  await api.dispose();
});

test('register, set an area, discover someone nearby, filter, and connect', async ({ page, baseURL }) => {
  const stamp = Date.now();
  const other = await memberViaApi(baseURL!, `meera.${stamp}@example.com`, 'Meera', 'Secunderabad');

  // Register through the UI
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Arjun');
  await page.getByLabel('Email address').fill(`arjun.${stamp}@example.com`);
  await page.getByLabel('Date of birth', { exact: true }).fill('1998-05-05');
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/verify\?setup=1$/);
  await page.getByRole('link', { name: 'Skip', exact: true }).click();
  await expect(page).toHaveURL(/\/profile\/interests\?setup=2$/);
  await page.getByRole('button', { name: 'Music', exact: true }).click();
  await page.getByRole('button', { name: 'Travel', exact: true }).click();
  await page.getByRole('button', { name: 'Reading', exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/profile\/photos\?setup=3$/);
  await page.getByRole('link', { name: 'Skip', exact: true }).click();
  await expect(page).toHaveURL(/\/profile\/location\?setup=4$/);

  // Set an area by searching
  const search = page.getByRole('combobox', { name: 'Town, city, village or district' });
  await search.fill('hyder');
  await expect(page.getByRole('option').first()).toContainText('Hyderabad');
  await search.press('Enter');
  await expect(page.locator('.location-current')).toContainText('Hyderabad, Telangana');

  // Discover shows the nearby member with a bucketed distance only
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/discover$/);
  const card = page.locator('article.person').filter({ hasText: 'Meera' });
  await expect(card).toContainText('Meera');
  await expect(card).toContainText('10 km away');

  // A 5 km radius excludes her (~6 km away); removing the filter brings her back
  await page.getByRole('link', { name: /^Filters/ }).click();
  await page.getByRole('slider', { name: 'Maximum distance' }).fill('0');
  await page.getByRole('button', { name: 'Apply Filters' }).click();
  await expect(page).toHaveURL(/\/discover$/);
  await expect(card).toHaveCount(0);
  await page.getByRole('link', { name: /^Filters/ }).click();
  await expect(page).toHaveURL(/\/discover\/filters$/);
  await page.reload();
  await expect(page.getByRole('slider', { name: 'Maximum distance' })).toHaveValue('0');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.getByRole('button', { name: 'Apply Filters' }).click();
  await expect(card).toContainText('Meera');

  // Connect; when she connects back, both see the match
  await card.getByRole('button', { name: 'Like Meera', exact: true }).click();
  await expect(card).toHaveCount(0);
  const me = await (await page.request.get('/api/v1/auth/me')).json();
  const back = await other.api.post('/api/v1/interactions/like', { data: { targetUserId: me.data.id } });
  const match = (await back.json()).data;
  expect(match.matched).toBe(true);
  await page.goto('/matches');
  await expect(page.getByText('Meera').first()).toBeVisible();

  // A conversation supports outgoing and incoming messages without reloading.
  await page.goto(`/chat/${match.conversationId}`);
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Hello Meera!');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('.message-row').filter({ hasText: 'Hello Meera!' })).toHaveCount(1);
  const reply = await other.api.post(`/api/v1/conversations/${match.conversationId}/messages`, { data: { content: 'Hello Arjun!' } });
  expect(reply.ok()).toBeTruthy();
  await expect(page.getByText('Hello Arjun!', { exact: true }).first()).toBeVisible();
  await other.api.dispose();
});

test('a temporary plan-status error does not send a signed-in member to checkout', async ({ page }) => {
  const reg = await page.request.post('/api/v1/auth/register', { data: {
    email: `plan-error.${Date.now()}@example.com`, password: PASSWORD, displayName: 'Plan Reviewer', dateOfBirth: '1997-04-04',
  } });
  expect(reg.ok()).toBeTruthy();
  await page.route('**/api/v1/subscriptions', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary failure' }) }));
  await page.goto('/discover');
  await expect(page.getByRole('heading', { name: 'Find Real Connections' })).toBeVisible();
  await expect(page).toHaveURL(/\/discover$/);
});

for (const width of [390, 1280]) {
  test(`main pages render without runtime errors at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const reg = await page.request.post('/api/v1/auth/register', { data: {
      email: `pages.${width}.${Date.now()}@example.com`, password: PASSWORD, displayName: 'Page Reviewer', dateOfBirth: '1997-04-04',
    } });
    expect(reg.ok()).toBeTruthy();
    for (const path of ['/discover', '/discover/swipe', '/discover/filters', '/matches', '/chat', '/profile', '/profile/edit', '/profile/interests', '/profile/photos', '/profile/location', '/verify', '/notifications', '/settings', '/settings/appearance', '/safety', '/upgrade']) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      await expect(page.locator('main')).not.toHaveText('');
      await expect(page.locator('.global-loader')).not.toHaveClass(/is-visible/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `horizontal overflow on ${path}`).toBe(true);
      if (path === '/discover') await page.screenshot({ path: testInfo.outputPath('discover.png'), fullPage: true });
    }
    expect(errors).toEqual([]);
  });
}
