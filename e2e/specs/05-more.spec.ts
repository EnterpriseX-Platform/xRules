// Remaining screens: project create · decision flow editor · connection test · data set lookup ·
// submit API for review → approve · webhook · release · tenant members.
import { test, expect, noErrorOnScreen, shot, pick, stamp, PROJECT } from './fixtures';

const s = stamp();
const P = `projects/${PROJECT}`;

test('Project: create a new project in the tenant and open it', async ({ page }) => {
  await page.goto('projects');
  await page.getByRole('button', { name: 'New Project' }).first().click();
  await page.locator('div.fixed input').first().fill(`E2E project ${s}`);
  await page.getByRole('button', { name: /^Create$/ }).click();
  await page.getByText(`E2E project ${s}`).click();
  await expect(page.locator('main h1')).toHaveText(/Rules/);
  await expect(page.getByText(/0 total|No rules/i).first()).toBeVisible();
  await shot(page, '05-project');
});

test('Decision flow: create, open the editor', async ({ page }) => {
  await page.goto(`${P}/flows?kind=DECISION`);
  await page.getByRole('button', { name: /New decision flow/ }).first().click();
  await page.locator('div.fixed input').first().fill(`e2e flow ${s}`);
  await page.getByRole('button', { name: /^Create$/ }).click();
  await page.getByText(`e2e flow ${s}`).first().click();
  await expect(page.locator('.react-flow')).toBeVisible();
  await noErrorOnScreen(page);
  await shot(page, '05-flow-editor');
});

test('Connection: test the read-only sample database', async ({ page }) => {
  await page.goto(`${P}/integrations/connections`);
  const row = page.locator('tr').filter({ hasText: /neb|sample|src|postgres/i }).first();
  await row.getByRole('button', { name: /^Test/ }).click();
  await expect(row.getByText(/ok|connected|success|\d+ ms/i).first()).toBeVisible({ timeout: 30_000 });
  await shot(page, '05-connection');
});

test('Data Set: look up the DAS standard price', async ({ page }) => {
  await page.goto(`${P}/data-sets`);
  await page.getByText(/das.standard.price|DAS standard price/i).first().click();
  await page.getByRole('button', { name: /Lookup|Look up/ }).first().click();
  const inputs = page.locator('main input');
  await inputs.nth(0).fill('DAS-1203-0045');
  if (await inputs.count() > 1) await inputs.nth(1).fill('2571');
  await page.getByRole('button', { name: /^Look up$/ }).click();
  await expect(page.getByText(/24000|24,000/).first()).toBeVisible();
  await shot(page, '05-data-set-lookup');
});

test('Approvals: author submits, a second reviewer (switching tenant) approves', async ({ page, browser, request }) => {
  // reviewer account, added to this tenant as Admin through the Members screen
  const reviewer = `e2e-reviewer-${s}@example.test`, pw = 'E2e-reviewer-1!';
  expect((await request.post('../xrules-api/auth/signup', { data: { email: reviewer, password: pw, name: 'E2E Reviewer', workspaceName: `Reviewer ${s}` } })).ok()).toBeTruthy();
  await page.goto('settings/tenant');
  await page.getByRole('button', { name: 'Members' }).click();
  await page.locator('#m-email').fill(reviewer);
  await pick(page, 'Role', /^Admin/);
  await page.getByRole('button', { name: /^Add$/ }).click();
  await expect(page.locator('tr', { hasText: reviewer })).toBeVisible();

  // author submits a new API for review
  await page.goto(`${P}/apis`);
  await page.getByRole('button', { name: 'New API' }).click();
  await page.locator('#sp-name').fill(`E2E review ${s}`);
  await page.locator('#sp-base').fill(`e2e-review-${s}`);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(/\/apis\/[^/]+$/);
  const sent = page.waitForResponse(r => r.url().includes('/platform/reviews') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Submit for review' }).click();
  expect((await sent).ok()).toBeTruthy();
  await page.goto(`${P}/approvals`);
  await expect(page.locator('tr', { hasText: `E2E review ${s}` })).toBeVisible();

  // reviewer logs in (lands in their own tenant), switches tenant, approves
  const ctx = await browser.newContext({ storageState: undefined });
  const rp = await ctx.newPage();
  await rp.goto('login');
  await rp.locator('input[type=email]').fill(reviewer);
  await rp.locator('input[type=password]').fill(pw);
  await rp.getByRole('button', { name: 'Sign in' }).click();
  await rp.waitForURL(u => !u.pathname.endsWith('/login'));
  await rp.getByRole('button', { name: /^Tenant/ }).click();
  await rp.getByRole('option', { name: /NEB Budget Bureau/ }).click();
  await rp.waitForURL(/\/projects$/);
  await rp.goto(`${P}/approvals`);
  const row = rp.locator('tr', { hasText: `E2E review ${s}` });
  await row.getByRole('button', { name: 'Approve' }).click();
  await rp.getByRole('button', { name: 'History' }).click();
  await expect(rp.locator('tr', { hasText: `E2E review ${s}` }).getByText(/approved/i)).toBeVisible();
  await rp.screenshot({ path: 'shots/05-approvals-reviewer.png', fullPage: true });
  await ctx.close();

  // tidy: remove the reviewer from the tenant
  await page.goto('settings/tenant');
  await page.getByRole('button', { name: 'Members' }).click();
  await page.locator('tr', { hasText: reviewer }).getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('tr', { hasText: reviewer })).toHaveCount(0);
});

test('Webhook: create one and see its secret', async ({ page }) => {
  await page.goto(`${P}/integrations/webhooks`);
  await page.getByRole('button', { name: 'New Webhook' }).first().click();
  await page.locator('div.fixed input').first().fill(`e2e hook ${s}`);
  await page.getByPlaceholder('https://example.com/webhooks/xrules').fill(`https://example.invalid/hook-${s}`);
  await page.getByRole('button', { name: 'Create webhook' }).click();
  await expect(page.getByText(`e2e hook ${s}`).first()).toBeVisible();
  await shot(page, '05-webhook');
});

test('Release: cut a release snapshot', async ({ page }) => {
  await page.goto(`${P}/releases`);
  const releases = page.locator('main tbody tr').filter({ hasText: /\d{4}-\d{2}-\d{2}/ });   // empty state is a row too
  await page.waitForTimeout(1500);
  const before = await releases.count();
  await page.getByRole('button', { name: 'New Release' }).click();
  await expect(releases).toHaveCount(before + 1);
  await shot(page, '05-release');
});

test('Tenant members: add a viewer, promote, remove', async ({ page, request }) => {
  const email = `e2e-member-${s}@example.test`;
  const r = await request.post('../xrules-api/auth/signup', { data: { email, password: 'E2e-member-1!', name: 'E2E Member', workspaceName: `E2E Member ${s}` } });
  expect(r.ok()).toBeTruthy();
  await page.goto('settings/tenant');
  await page.getByRole('button', { name: 'Members' }).click();
  await page.locator('#m-email').fill(email);
  await pick(page, 'Role', /Viewer/);
  await page.getByRole('button', { name: /^Add$/ }).click();
  const row = page.locator('tr', { hasText: email });
  await expect(row.getByRole('button', { name: /^Viewer/ })).toBeVisible();
  await row.getByRole('button', { name: /^Viewer/ }).click();
  await row.getByRole('button', { name: /^Member/ }).click();
  await expect(row.getByRole('button', { name: /^Member/ })).toBeVisible();
  await row.getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('tr', { hasText: email })).toHaveCount(0);
  await shot(page, '05-members');
});
