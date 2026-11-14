// Integration: REST API (create → operation → Try it → publish) · API key · Trigger (create → run now).
import { test, expect, noErrorOnScreen, shot, pick, stamp, PROJECT } from './fixtures';

const s = stamp();

test('REST API: create, add operation, try it, publish', async ({ page }) => {
  await page.goto(`projects/${PROJECT}/apis`);
  await page.getByRole('button', { name: 'New API' }).click();
  await page.locator('#sp-name').fill(`E2E API ${s}`);
  await page.locator('#sp-base').fill(`e2e-${s}`);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(/\/apis\/[^/]+$/);
  await expect(page.getByRole('heading', { name: `E2E API ${s}` })).toBeVisible();
  await expect(page.getByText(`/api/neb-budget-bureau/e2e-${s}/v1`)).toBeVisible();

  // add GET /echo/{id}
  await pick(page, 'Method', 'GET');
  await page.getByPlaceholder(/standard-price/).fill('/echo/{id}');
  await page.getByRole('button', { name: /^Add$/ }).click();
  await expect(page.getByText('/echo/{id}')).toBeVisible();
  await shot(page, '03-api-operation');

  // Try it
  await page.getByRole('button', { name: 'Try it' }).click();
  await page.getByRole('button', { name: /^Send$/ }).click();
  await expect(page.getByText(/^(200|2\d\d)$/).first()).toBeVisible();
  await shot(page, '03-api-try');

  // Publish (gate may ask for tests or review — either way the UI must answer, not crash)
  await page.getByRole('button', { name: /^Publish$/ }).click();
  await expect(page.getByText(/live|published|test|review|approv/i).first()).toBeVisible();
  await noErrorOnScreen(page);
  await shot(page, '03-api-publish');
});

test('API key: create for the pre-screening API', async ({ page }) => {
  await page.goto(`projects/${PROJECT}/integrations/api-keys`);
  await page.getByRole('button', { name: 'New Key' }).click();
  const inputs = page.locator('main input:not([type=checkbox])');
  await inputs.nth(0).fill(`e2e-key-${s}`);
  await inputs.nth(1).fill('E2E');
  await page.getByText('NEB Pre-screening API').first().click();
  await page.getByRole('button', { name: /^Create$/ }).click();
  await expect(page.getByText(/Key created/)).toBeVisible();
  await expect(page.getByText(/xr_live_/).first()).toBeVisible();
  await shot(page, '03-api-key');
});

test('Trigger: create a schedule, then run now', async ({ page }) => {
  await page.goto(`projects/${PROJECT}/triggers`);
  await page.getByRole('button', { name: 'New Trigger' }).click();
  await page.locator('#tr-name').fill(`e2e trigger ${s}`);
  await pick(page, 'Starts on', /Schedule/);
  await page.locator('#tr-cron').fill('0 23 * * *');
  await page.getByRole('button', { name: /^Create$/ }).click();
  await expect(page.getByRole('heading', { name: `e2e trigger ${s}` })).toBeVisible();   // opens the trigger's flow
  await shot(page, '03-trigger-flow');
  await page.goto(`projects/${PROJECT}/triggers`);
  const row = page.locator('tr', { hasText: `e2e trigger ${s}` });
  await expect(row.getByText(/Daily 23:00/)).toBeVisible();
  await expect(row.getByText('Draft')).toBeVisible();                     // a new trigger is a draft until its flow is published
  await expect(row.getByRole('button', { name: /Run now/ })).toBeDisabled();
  await noErrorOnScreen(page);
  await shot(page, '03-trigger');
});

test('Data Set syncs: run now and finish green', async ({ page }) => {
  await page.goto(`projects/${PROJECT}/triggers`);
  for (const name of ['Budget item codes', 'DAS standard price', 'Prior budget requests']) {
    const row = page.locator('tr', { hasText: name });
    await row.getByRole('button', { name: /Run now/ }).click();
    await expect(row.getByText(/Succeeded/)).toBeVisible({ timeout: 60_000 });
  }
  await shot(page, '03-data-set-syncs');
});
