// ML inside the existing structure (TOR 4.13), all through the UI:
// Data Sets › Upload + Prepare  →  Models › Train / Evaluate / Report / Gate / Publish  →  Model Call rule.
import path from 'node:path';
import { test, expect, shot, pick, stamp, PROJECT } from './fixtures';

const s = stamp();
const DS = `ml requests ${s}`;
const DS_SLUG = DS.replace(/[^a-z0-9]+/g, '-');
const MODEL = `e2e alignment ${s}`;
test.describe.configure({ mode: 'serial' });

test('Data Set: upload CSV, profile, prepare and apply (4.13.1.1–4.13.1.3)', async ({ page }) => {
  await page.goto('projects/_integration/data-sets');
  await page.getByRole('button', { name: 'Upload file' }).click();
  await page.locator('#ds-name').fill(DS);
  await page.locator('#ds-keys').fill('requestNo');
  await page.locator('input[type=file]').setInputFiles(path.join(__dirname, '..', 'fixtures', 'ml-requests.csv'));
  await page.getByRole('button', { name: /^Upload$/ }).click();
  await page.waitForURL(/\/data-sets\/[^/]+$/);
  await page.getByRole('button', { name: 'Prepare' }).click();

  await page.getByRole('button', { name: /^No target/ }).click();     // target dropdown in the Profile header
  await page.getByRole('button', { name: /^aligned$/ }).first().click();
  await page.getByRole('button', { name: 'Analyse' }).click();
  const amountRow = page.locator('tr', { hasText: /^amount/ }).first();
  await expect(amountRow.getByText(/^[1-9]\d*$/).last()).toBeVisible();          // outliers found
  await expect(page.getByText('Relationship to aligned')).toBeVisible();
  await shot(page, '07-profile');

  // steps: remove outliers in amount · new column perUnit · min-max priorRate · center qty
  await page.getByRole('button', { name: 'amount', exact: true }).click();
  await page.getByRole('button', { name: 'Add step' }).click();
  await pick(page, /^Step$/, /^New column/);
  await page.locator('#pr-name').fill('perUnit');
  await page.locator('#pr-expr').fill('amount / qty');
  await page.getByRole('button', { name: 'Add step' }).click();
  await pick(page, /^Step$/, /^Min-Max scaling/);
  await page.getByRole('button', { name: 'priorRate', exact: true }).click();
  await page.getByRole('button', { name: 'Add step' }).click();
  await pick(page, /^Step$/, /^Centering/);
  await page.getByRole('button', { name: 'qty', exact: true }).click();
  await page.getByRole('button', { name: 'Add step' }).click();
  await page.getByRole('button', { name: 'Preview result' }).click();
  await expect(page.getByText(/Preview · 399 rows after preparation/)).toBeVisible();
  await shot(page, '07-prepare-preview');
  await page.getByRole('button', { name: 'Apply as new snapshot' }).click();
  await expect(page.getByText(/New snapshot active · 399 rows/)).toBeVisible();
});

test('Model: train with parameter search, evaluate, report (4.13.1.4–4.13.1.7)', async ({ page, context }) => {
  await page.goto(`projects/${PROJECT}/models`);
  await page.getByRole('button', { name: 'New Model' }).first().click();
  await page.locator('div.fixed input').first().fill(MODEL);
  await page.getByRole('button', { name: /^Create/ }).click();
  await page.getByText(MODEL).first().click();
  await page.waitForURL(/\/models\/[^/]+$/);

  await page.getByRole('button', { name: 'Choose a Data Set' }).click();
  await page.getByRole('button', { name: new RegExp(`^${DS_SLUG}`) }).click();
  await page.getByRole('button', { name: 'Choose an algorithm' }).click();
  await page.getByRole('button', { name: /^Random forest\s*classification/ }).click();
  await page.getByRole('button', { name: 'Choose a column' }).click();
  await page.getByRole('button', { name: /^aligned$/ }).first().click();
  for (const f of ['amount', 'qty', 'strategy', 'priorRate', 'perUnit']) await page.getByRole('button', { name: f, exact: true }).click();
  await page.locator('#tr-search').fill('{ "max_depth": [3, 6, 10] }');
  await shot(page, '07-train-form');
  await page.getByRole('button', { name: 'Start training' }).click();

  const row = page.locator('tr', { hasText: 'v1' });
  await expect(row.getByText('ready')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/f1/).first()).toBeVisible();
  await expect(page.getByText('Confusion matrix')).toBeVisible();
  await expect(page.getByText('Feature importance')).toBeVisible();
  await shot(page, '07-evaluation');
  const popup = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Open report' }).click();
  const rep = await popup;
  await expect(rep.getByText('Confusion matrix')).toBeVisible();
  await rep.screenshot({ path: 'shots/07-report.png', fullPage: true });
  await rep.close();
});

test('Model: gate blocks a weak version, publish passes (publish gate)', async ({ page }) => {
  await page.goto(`projects/${PROJECT}/models`);
  await page.getByText(MODEL).first().click();
  await page.getByRole('button', { name: 'Versions' }).click();
  await pick(page, 'Metric', /^f1$/);
  await page.locator('#gate-min').fill('1.01');
  await page.getByRole('button', { name: /^Save$/ }).click();
  await expect(page.getByText('Now: f1 ≥ 1.01')).toBeVisible();
  await page.locator('tr', { hasText: 'v1' }).getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText(/Evaluation gate: f1 .* is below 1.01/)).toBeVisible();
  await page.locator('#gate-min').fill('0.8');
  await page.getByRole('button', { name: /^Save$/ }).click();
  await page.locator('tr', { hasText: 'v1' }).getByRole('button', { name: 'Publish' }).click();
  await expect(page.locator('tr', { hasText: 'v1' }).getByText('published')).toBeVisible();
  await page.getByRole('button', { name: 'Try' }).click();
  await page.locator('#try-rows').fill(JSON.stringify([{ amount: 1200000, qty: 4, strategy: 'S1', priorRate: 0.8, perUnit: 300000 }]));
  await page.getByRole('button', { name: 'Predict' }).click();
  await expect(page.locator('tr').filter({ hasText: /^1/ }).getByText(/yes|no/)).toBeVisible();
  await shot(page, '07-try');
});

test('Model Call rule: published model answers inside the decision layer (4.13.3)', async ({ page }) => {
  await page.goto(`projects/${PROJECT}/rules?new=1`);
  await page.locator('div.fixed button', { hasText: 'Model Call' }).first().click();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.locator('form input').first().fill(`e2e model call ${s}`);
  await page.getByRole('button', { name: /Create rule/ }).click();
  await page.waitForURL(/\/rules\/[^/?]+$/);
  await page.getByRole('button', { name: MODEL }).click();
  await page.locator('#mc-each').fill('items');
  await page.getByRole('button', { name: /^Save$/ }).first().click();
  await page.getByRole('button', { name: /^Test$/ }).click();
  await page.locator('.monaco-editor').first().waitFor();
  // typing into Monaco auto-closes brackets; set the model text directly
  await page.evaluate(v => (window as any).monaco.editor.getModels()[0].setValue(v),
    JSON.stringify({ items: [{ amount: 1200000, qty: 4, strategy: 'S1', priorRate: 0.8, perUnit: 300000 }] }, null, 2));
  await page.getByRole('button', { name: /^Run$/ }).click();
  await expect(page.getByText(/"prediction"/).first()).toBeVisible({ timeout: 30_000 });
  await shot(page, '07-model-call');
});
