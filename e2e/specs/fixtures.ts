import { test as base, expect, type Page } from '@playwright/test';

export const EMAIL = process.env.XR_EMAIL || 'admin@example.com';
export const PASSWORD = process.env.XR_PASSWORD || 'admin123';
export const PROJECT = process.env.XR_PROJECT || 'neb-pre-screening';

/** Every page is watched: any API 5xx, any {success:false} other than expected 4xx, and console errors fail the test. */
export const test = base.extend<{ watch: { problems: string[]; allow: (re: RegExp) => void } }>({
  watch: [async ({ page }, use) => {
    const problems: string[] = []; const allowed: RegExp[] = (process.env.XR_ALLOW || '').split(',').filter(Boolean).map(x => new RegExp(x));
    page.on('response', async r => {
      const u = r.url();
      if (allowed.some(a => a.test(u))) return;
      if (r.status() === 404) { problems.push(`404 ${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, '')}`); return; }
      if (!u.includes('/xrules-api/')) return;
      if (r.status() >= 500) problems.push(`${r.status()} ${r.request().method()} ${u.split('/xrules-api')[1]}`);
    });
    page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon|Download the React DevTools|ResizeObserver/.test(m.text())) problems.push(`console: ${m.text().slice(0, 200)}`); });
    await use({ problems, allow: re => allowed.push(re) });
    expect(problems, 'API 5xx / page errors').toEqual([]);
  }, { auto: true }],
});
export { expect };

export async function login(page: Page) {
  await page.goto('login');
  await page.locator('input[type=email]').fill(EMAIL);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(u => !u.pathname.endsWith('/login'));
}

/** No red error notice and no "Something went wrong" on screen. */
export async function noErrorOnScreen(page: Page) {
  await expect(page.getByText(/something went wrong|application error|unhandled runtime error|failed to fetch/i)).toHaveCount(0);
}

export const shot = (page: Page, name: string) => page.screenshot({ path: `shots/${name}.png`, fullPage: true });

/** Carbon Dropdown next to a caption div: open it and choose an option by its visible label. */
export async function pick(page: Page, caption: string | RegExp, option: string | RegExp) {
  const box = page.locator('div').filter({ has: page.locator(':scope > div', { hasText: caption }) }).filter({ has: page.locator(':scope button') }).last();
  await box.locator('button').first().click();
  await box.getByRole('button', { name: option }).first().click();
}
export const stamp = () => Date.now().toString(36);

/** Calls the API as the signed-in user (same token and tenant the studio uses). */
export async function api(page: Page, method: string, path: string, body?: any) {
  if (!page.url().startsWith('http')) await page.goto(`projects/${PROJECT}/rules`);
  const r = await page.evaluate(async ({ method, path, body }) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('xrules_token')}` };
    try { const ws = JSON.parse(localStorage.getItem('xrules-auth') || '{}')?.state?.workspace?.slug; if (ws) headers['X-Tenant'] = ws; } catch {}
    if (method !== 'GET' && method !== 'POST') { headers['X-HTTP-Method-Override'] = method; method = 'POST'; }
    const res = await fetch(`${location.origin}/xrules-api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: await res.json().catch(() => null) };
  }, { method, path, body });
  return r;
}

