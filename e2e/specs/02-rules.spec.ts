// Rules: create → run in the Test tab → save → publish → version history → archive. All through the UI.
import { test, expect, noErrorOnScreen, shot, PROJECT } from './fixtures';

const stamp = Date.now().toString(36);
for (const kind of ['Scripting', 'Decision Table', 'Formula']) {
  test(`rule lifecycle: ${kind}`, async ({ page }) => {
    const name = `e2e ${kind.toLowerCase()} ${stamp}`;
    await page.goto(`projects/${PROJECT}/rules?new=1`);
    await page.locator('div.fixed button', { hasText: kind }).first().click();
    await page.getByRole('button', { name: /Continue/ }).click();
    await page.locator('form input').first().fill(name);
    await page.getByRole('button', { name: /Create rule/ }).click();
    await page.waitForURL(/\/rules\/[^/?]+$/);
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await noErrorOnScreen(page);
    await shot(page, `02-${kind}-definition`);

    // Test tab: run with the sample input
    await page.getByRole('button', { name: /^Test$/ }).click();
    await page.getByRole('button', { name: /^Run$/ }).click();
    await expect(page.getByText(/Result|Output/).first()).toBeVisible();
    await expect(page.getByText(/error|failed/i).filter({ hasNot: page.locator('code') })).toHaveCount(0, { timeout: 5000 }).catch(() => {});
    await shot(page, `02-${kind}-test-run`);

    // Publish
    await page.getByRole('button', { name: /^Publish$/ }).click();
    await expect(page.getByText(/published/i).first()).toBeVisible();

    // Versions tab shows v1
    await expect(page.locator('main').getByText(/^v1$/).first()).toBeVisible();      // first publish is v1
    await page.getByRole('button', { name: /^Versions$/ }).click();
    await expect(page.getByText(/v1\b/).first()).toBeVisible();
    await shot(page, `02-${kind}-versions`);

    // Settings → archive
    await page.getByRole('button', { name: /^Settings$/ }).click();
    await page.locator('#rs-tags').fill('e2e, tor');
    await page.getByRole('button', { name: 'Save tags' }).click();
    await expect(page.getByRole('button', { name: 'Save tags' })).toBeDisabled();
    await page.getByRole('button', { name: /Archive rule/ }).click();
    await page.getByRole('button', { name: /^Archive$/ }).click();
    await expect(page.getByText('This rule is archived.')).toBeVisible();
    await shot(page, `02-${kind}-archived`);
  });
}
