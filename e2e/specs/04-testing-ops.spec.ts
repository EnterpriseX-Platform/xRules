// Testing, Bulk Runs, Simulations, Vocabulary, Approvals, Alerts, Members & Access, Tenant — through the UI.
import { test, expect, noErrorOnScreen, shot, pick, stamp, PROJECT, EMAIL } from './fixtures';

const s = stamp();
const P = `projects/${PROJECT}`;
const REQ = { context: { fiscalYear: 2571, agencyCode: '03007', areaCode: '10' },
  items: [{ lineId: 'L-001', budgetType: 'equipment', itemCode: 'DAS-1203-0045', qty: 4, unitPrice: 28500, amount: 114000 }] };

test('Test case: create against the decision flow, run it, see it pass', async ({ page }) => {
  await page.goto(`projects/_all/tests`);
  await page.locator('#suite-new').fill(`e2e suite ${s}`);
  await page.getByRole('button', { name: 'Create suite' }).click();
  await pick(page, 'Test suite', `e2e suite ${s}`);
  await page.getByRole('button', { name: 'New Test Case' }).click();
  await page.locator('#tc-name').fill(`e2e over standard price ${s}`);
  await pick(page, 'Target type', /Decision Flow/);
  await pick(page, /^Target$/, /neb.prescreen/i);
  await page.locator('#tc-in').fill(JSON.stringify(REQ, null, 2));
  await page.locator('#tc-exp').fill(JSON.stringify([{ kind: 'has_finding', code: 'TOR-4.4.1.3', severity: 'WARNING' }], null, 2));
  await page.getByRole('button', { name: /^Save$/ }).click();
  const row = page.locator('tr', { hasText: `e2e over standard price ${s}` });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /^Run$/ }).click();
  await expect(row.getByText(/pass/i).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Run suite' }).click();
  await page.waitForTimeout(3000);
  await shot(page, '04-test-case');
  await page.goto(`projects/_all/test-runs`);
  const run = page.locator('tr', { hasText: `e2e suite ${s}` }).first();
  await expect(run).toBeVisible();
  await expect(run.getByText(/pass/i).first()).toBeVisible();
  await shot(page, '04-test-runs');
});

test('Bulk run: paste rows, run the decision flow, open results', async ({ page }) => {
  await page.goto(`${P}/bulk`);
  await page.getByRole('button', { name: 'New Bulk Run' }).click();
  await page.locator('#b-name').fill(`e2e bulk ${s}`);
  await pick(page, 'Run against', /Decision Flow/);
  await pick(page, /Target/, /neb.prescreen/i);
  await pick(page, 'Input data', /Paste JSON/);
  await page.locator('#b-rows').fill(JSON.stringify([REQ, { ...REQ, items: [{ ...REQ.items[0], unitPrice: 24000, amount: 96000 }] }]));
  await page.getByRole('button', { name: 'Start run' }).click();
  await page.getByText(`e2e bulk ${s}`).first().click();
  await expect(page.getByText(/Completed/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/2 \/ 2/).first()).toBeVisible();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download results/ }).click();
  expect((await dl).suggestedFilename()).toMatch(/\.csv$/);
  await shot(page, '04-bulk');
});

test('Simulation: backtest the decision flow on recent requests', async ({ page }) => {
  await page.goto(`${P}/simulations`);
  await pick(page, 'Decision Flow', /neb.prescreen/i);
  await page.locator('#bt-lim').fill('20');
  await page.getByRole('button', { name: 'Start backtest' }).click();
  await expect(page.getByText(/Backtest: neb-prescreen/).first()).toBeVisible({ timeout: 30_000 });
  await noErrorOnScreen(page);
  await shot(page, '04-simulation');
});

test('Vocabulary: add a term, write a business rule, save it as a draft rule', async ({ page }) => {
  await page.goto(`${P}/vocabulary`);
  await page.getByRole('button', { name: 'Vocabulary' }).last().click();
  await page.locator('#t-term').fill(`requested amount ${s}`);
  await page.getByPlaceholder('item.unitPrice').fill('item.amount');
  await pick(page, 'Type', /^Money|^Number/);
  await page.getByRole('button', { name: /^Add$/ }).click();
  await expect(page.getByText(`requested amount ${s}`).first()).toBeVisible();
  await page.getByRole('button', { name: 'Write rules' }).click();
  await page.locator('#sent').fill(`IF requested amount ${s} > 1000000 THEN WARN "Amount above 1 million" LEVEL WARNING CODE E2E-${s}`);
  await page.getByRole('button', { name: 'Check sentence' }).click();
  await page.locator('#rule-name').fill(`e2e-vocab-${s}`);
  await page.getByRole('button', { name: /Save as draft/ }).click();
  await expect(page.getByText(`Saved rule e2e-vocab-${s}`)).toBeVisible();
  await page.goto(`${P}/rules`);
  await expect(page.getByText(`e2e-vocab-${s}`).first()).toBeVisible();
  await shot(page, '04-vocabulary');
});

test('Alerts: save a webhook, evaluate now', async ({ page }) => {
  await page.goto(`projects/_all/monitor/alerts`);
  await page.locator('#al-hook').fill('https://example.invalid/xrules-e2e');
  await page.getByRole('button', { name: /^Save$/ }).click();
  await page.getByRole('button', { name: 'Evaluate now' }).click();
  await noErrorOnScreen(page);
  await page.locator('#al-hook').fill('');
  await page.getByRole('button', { name: /^Save$/ }).click();
  await shot(page, '04-alerts');
});

test('Approvals: pending and history tabs', async ({ page }) => {
  await page.goto(`projects/_all/approvals`);
  await page.getByRole('button', { name: 'History' }).click();
  await noErrorOnScreen(page);
});

test('Members & Access: switch visibility and back', async ({ page }) => {
  await page.goto(`${P}/access`);
  await page.getByRole('button', { name: /Only people added here/ }).click();
  await expect(page.getByRole('button', { name: /Only people added here/ })).toHaveClass(/border-\[#0f62fe\]/);
  await page.getByRole('button', { name: /Everyone in the tenant/ }).click();
  await expect(page.getByRole('button', { name: /Everyone in the tenant/ })).toHaveClass(/border-\[#0f62fe\]/);
  await shot(page, '04-access');
});

test('Tenant: rename and restore', async ({ page }) => {
  await page.goto('settings/tenant');
  const name = page.locator('#t-name');
  const orig = await name.inputValue();
  await name.fill(`${orig} (e2e)`);
  await page.getByRole('button', { name: /^Save$/ }).click();
  await expect(page.getByRole('heading', { name: `${orig} (e2e)` })).toBeVisible();
  await name.fill(orig);
  await page.getByRole('button', { name: /^Save$/ }).click();
  await expect(page.getByRole('heading', { name: orig })).toBeVisible();
  await page.getByRole('button', { name: 'Members' }).first().click();
  await expect(page.getByText(EMAIL)).toBeVisible();
  await shot(page, '04-tenant');
});
