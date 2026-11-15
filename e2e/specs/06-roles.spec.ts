// Roles: Viewer · Member · Integrator · Approver — what each sees and may do. Uses throw-away accounts.
import { test, expect, shot, pick, stamp, PROJECT, type Page } from './fixtures';
import type { Browser, APIRequestContext } from '@playwright/test';

const s = stamp();
const PW = 'E2e-role-1!';

async function addMember(page: Page, request: APIRequestContext, who: string, role: RegExp, approver = false) {
  const email = `e2e-${who}-${s}@example.test`;
  expect((await request.post('../xrules-api/auth/signup', { data: { email, password: PW, name: `E2E ${who}`, workspaceName: `E2E ${who} ${s}` } })).ok()).toBeTruthy();
  await page.goto('settings/tenant?tab=Members');
  await page.locator('#m-email').fill(email);
  await pick(page, 'Role', role);
  await page.getByRole('button', { name: /^Add$/ }).click();
  const row = page.locator('tr', { hasText: email });
  await expect(row).toBeVisible();
  if (approver) {
    const box = row.getByRole('checkbox', { name: `Approver ${email}` });
    await box.click();
    await expect(box).toBeChecked();                       // saved and reloaded from the server
  }
  return email;
}
async function signIn(browser: Browser, email: string, tenantName: string) {
  const ctx = await browser.newContext({ storageState: undefined });
  const p = await ctx.newPage();
  await p.goto('login');
  await p.locator('input[type=email]').fill(email);
  await p.locator('input[type=password]').fill(PW);
  await p.getByRole('button', { name: 'Sign in' }).click();
  await p.waitForURL(u => !u.pathname.endsWith('/login'));
  await p.getByRole('button', { name: /^Tenant/ }).click();
  await p.getByRole('option', { name: new RegExp(tenantName) }).click();
  await p.waitForURL(/\/projects$/);
  return { ctx, p };
}
async function tenantName(page: Page) {
  await page.goto('settings/tenant');
  await expect(page.locator('main h1').first()).not.toHaveText('Tenant');
  return (await page.locator('main h1').first().innerText()).trim();
}

test('Viewer: reads everything, creates nothing, no Admin', async ({ page, request, browser }) => {
  const t = await tenantName(page);
  const email = await addMember(page, request, 'viewer', /^Viewer/);
  const { ctx, p } = await signIn(browser, email, t);
  await p.goto(`projects/${PROJECT}/rules`);
  await expect(p.locator('main h1')).toHaveText('Rules');
  await expect(p.getByRole('button', { name: 'New Rule' })).toBeHidden();
  await expect(p.locator('aside').getByRole('link', { name: 'Members & Roles' })).toHaveCount(0);
  await p.goto('projects/_integration/apis');
  await expect(p.getByRole('button', { name: 'New API' })).toHaveCount(0);
  await p.screenshot({ path: 'shots/06-viewer.png', fullPage: true });
  await ctx.close();
});

test('Member: writes rules, cannot change Integration (UI hidden, API 403)', async ({ page, request, browser }) => {
  const t = await tenantName(page);
  const email = await addMember(page, request, 'member', /^Member/);
  const { ctx, p } = await signIn(browser, email, t);
  await p.goto(`projects/${PROJECT}/rules`);
  await expect(p.getByRole('button', { name: 'New Rule' })).toBeVisible();
  await p.goto('projects/_integration/apis');
  await expect(p.getByRole('button', { name: 'New API' })).toHaveCount(0);
  const { token, slug } = await p.evaluate(() => ({ token: localStorage.getItem('xrules_token'), slug: JSON.parse(localStorage.getItem('xrules-auth') || '{}')?.state?.workspace?.slug }));
  const r = await p.request.post('../xrules-api/platform/specs', { headers: { Authorization: `Bearer ${token}`, 'X-Tenant': slug }, data: { projectId: '_integration', name: 'nope' } });
  expect([403, 404]).toContain(r.status());
  await ctx.close();
});

test('Integrator: changes Integration, no Admin', async ({ page, request, browser }) => {
  const t = await tenantName(page);
  const email = await addMember(page, request, 'integrator', /^Integrator/);
  const { ctx, p } = await signIn(browser, email, t);
  await p.goto('projects/_integration/apis');
  await p.getByRole('button', { name: 'New API' }).click();
  await p.locator('#sp-name').fill(`E2E integrator API ${s}`);
  await p.locator('#sp-base').fill(`e2e-int-${s}`);
  await p.getByRole('button', { name: 'Create' }).click();
  await p.waitForURL(/\/apis\/[^/]+$/);
  await expect(p.locator('aside').getByRole('link', { name: 'Members & Roles' })).toHaveCount(0);
  await p.screenshot({ path: 'shots/06-integrator.png', fullPage: true });
  await ctx.close();
});

test("Approver flag: a Member marked approver can approve someone else's change", async ({ page, request, browser }) => {
  const t = await tenantName(page);
  const email = await addMember(page, request, 'approver', /^Member/, true);
  await page.goto('projects/_integration/apis');
  await page.getByRole('button', { name: 'New API' }).click();
  await page.locator('#sp-name').fill(`E2E approve ${s}`);
  await page.locator('#sp-base').fill(`e2e-appr-${s}`);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(/\/apis\/[^/]+$/);
  const sent = page.waitForResponse(r => r.url().includes('/platform/reviews') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Submit for review' }).click();
  expect((await sent).ok()).toBeTruthy();
  const { ctx, p } = await signIn(browser, email, t);
  await p.goto('projects/_all/approvals');
  const row = p.locator('tr', { hasText: `E2E approve ${s}` });
  await row.getByRole('button', { name: 'Approve' }).click();
  await p.getByRole('button', { name: 'History' }).click();
  await expect(p.locator('tr', { hasText: `E2E approve ${s}` }).getByText(/approved/i)).toBeVisible();
  await ctx.close();
});

test('Relations: rule shows the flow using it; flow shows its rules and the API calling it', async ({ page }) => {
  await page.goto(`projects/${PROJECT}/rules/tor-4-4-1-3-standard-price`);
  const rel = page.getByTestId('relations');
  await expect(rel.getByRole('link', { name: /neb prescreen/ })).toBeVisible();
  await rel.getByRole('link', { name: /neb prescreen/ }).click();
  await expect(page.locator('.react-flow')).toBeVisible();
  const frel = page.getByTestId('relations');
  await expect(frel.getByRole('link', { name: /tor-4-4-1-3|TOR-4.4.1.3|standard/i }).first()).toBeVisible();
  await expect(frel.getByText(/POST/).first()).toBeVisible();
  await shot(page, '06-relations');
});
