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
  await page.goto(`projects/_integration/integrations/connections`);
  const row = page.locator('tr').filter({ hasText: /neb|sample|src|postgres/i }).first();
  await row.getByRole('button', { name: /^Test/ }).click();
  await expect(row.getByText(/ok|connected|success|\d+ ms/i).first()).toBeVisible({ timeout: 30_000 });
  await shot(page, '05-connection');
});

test('Data Set: look up the DAS standard price', async ({ page }) => {
  await page.goto(`projects/_integration/data-sets`);
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
  await expect(page.locator('main h1').first()).not.toHaveText('Tenant');   // wait for the tenant to load
  const tenantName = (await page.locator('main h1').first().innerText()).trim();
  await page.getByRole('button', { name: 'Members' }).first().click();
  await page.locator('#m-email').fill(reviewer);
  await pick(page, 'Role', /^Admin/);
  await page.getByRole('button', { name: /^Add$/ }).click();
  await expect(page.locator('tr', { hasText: reviewer })).toBeVisible();

  // author submits a new API for review
  await page.goto(`projects/_integration/apis`);
  await page.getByRole('button', { name: 'New API' }).click();
  await page.locator('#sp-name').fill(`E2E review ${s}`);
  await page.locator('#sp-base').fill(`e2e-review-${s}`);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(/\/apis\/[^/]+$/);
  const sent = page.waitForResponse(r => r.url().includes('/platform/reviews') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Submit for review' }).click();
  expect((await sent).ok()).toBeTruthy();
  await page.goto(`projects/_all/approvals`);
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
  await rp.getByRole('option', { name: new RegExp(tenantName) }).click();
  await rp.waitForURL(/\/projects$/);
  await rp.goto(`projects/_all/approvals`);
  const row = rp.locator('tr', { hasText: `E2E review ${s}` });
  await row.getByRole('button', { name: 'Approve' }).click();
  await rp.getByRole('button', { name: 'History' }).click();
  await expect(rp.locator('tr', { hasText: `E2E review ${s}` }).getByText(/approved/i)).toBeVisible();
  await rp.screenshot({ path: 'shots/05-approvals-reviewer.png', fullPage: true });
  await ctx.close();

  // tidy: remove the reviewer from the tenant
  await page.goto('settings/tenant');
  await page.getByRole('button', { name: 'Members' }).first().click();
  await page.locator('tr', { hasText: reviewer }).getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('tr', { hasText: reviewer })).toHaveCount(0);
});

test('Webhook: create one and see its secret', async ({ page }) => {
  await page.goto(`projects/_integration/integrations/webhooks`);
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
  await page.getByRole('button', { name: 'Members' }).first().click();
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

test('Tenant-level testing reaches a rule in another project; scope filter narrows it', async ({ page }) => {
  // new project with one published formula rule
  await page.goto('projects');
  await page.getByRole('button', { name: 'New Project' }).first().click();
  await page.locator('div.fixed input').first().fill(`E2E project x ${s}`);
  await page.getByRole('button', { name: /^Create$/ }).click();
  await page.getByText(`E2E project x ${s}`).click();
  await page.waitForURL(/\/projects\/[^/]+\/rules/);
  const projSlug = new URL(page.url()).pathname.split('/projects/')[1].split('/')[0];
  await page.goto(`projects/${projSlug}/rules?new=1`);
  await page.locator('div.fixed button', { hasText: 'Formula' }).first().click();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.locator('form input').first().fill(`e2e cross ${s}`);
  await page.getByRole('button', { name: /Create rule/ }).click();
  await page.waitForURL(/\/rules\/[^/?]+$/);
  await page.getByRole('button', { name: /^Publish$/ }).click();
  await expect(page.locator('main').getByText(/^published$/).first()).toBeVisible();

  // tenant-level Testing: target the rule in that project
  await page.goto('projects/_all/tests');
  await page.getByRole('button', { name: 'New Test Case' }).click();
  await page.locator('#tc-name').fill(`e2e cross-project ${s}`);
  await pick(page, 'Target type', /^Rule/);
  await pick(page, /^Target$/, `e2e cross ${s}`);
  await page.locator('#tc-in').fill('{ "amount": 5 }');
  await page.locator('#tc-exp').fill('[ { "kind": "max_ms", "value": 5000 } ]');
  await page.getByRole('button', { name: /^Save$/ }).click();
  const row = page.locator('tr', { hasText: `e2e cross-project ${s}` });
  await row.getByRole('button', { name: /^Run$/ }).click();
  await expect(row.getByText(/pass/i).first()).toBeVisible({ timeout: 30_000 });

  // scope filter: the case shows under its project, not under NEB Pre-screening
  await pick(page, 'Showing', `E2E project x ${s}`);
  await expect(page.locator('tr', { hasText: `e2e cross-project ${s}` })).toBeVisible();
  await pick(page, 'Showing', /NEB Pre-screening/);
  await expect(page.locator('tr', { hasText: `e2e cross-project ${s}` })).toHaveCount(0);
  await shot(page, '05-cross-project-testing');
});

test('Sidebar: Decision Engine first; Integration/Testing/Monitor tenant-level; Admin for admins', async ({ page }) => {
  await page.goto(`projects/${PROJECT}/rules`);
  const nav = page.locator('aside');
  await expect(nav.getByRole('link', { name: 'Rules' })).toHaveAttribute('href', new RegExp(`/projects/[^/]+/rules$`));
  await expect(nav.getByRole('link', { name: 'REST APIs' })).toHaveAttribute('href', /\/projects\/_integration\/apis$/);
  await expect(nav.getByRole('link', { name: 'Test Suites' })).toHaveAttribute('href', /\/projects\/_all\/tests$/);
  await expect(nav.getByRole('link', { name: 'Members & Roles' })).toBeVisible();          // admin section
  const order = await nav.locator('a').allInnerTexts();
  expect(order.indexOf('Rules')).toBeLessThan(order.indexOf('REST APIs'));                  // daily work first
  await nav.getByRole('button', { name: 'Monitor' }).click();                                // collapse
  await expect(nav.getByRole('link', { name: 'API Traffic' })).toHaveCount(0);
  await nav.getByRole('button', { name: 'Monitor' }).click();
  await shot(page, '05-sidebar');
});
