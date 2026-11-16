// Rule folders used like packages: folder → sub-folder, move a rule in (folder picker and drag-and-drop),
// a folder lists the rules of its sub-folders too, rename, and removing a folder keeps its rules.
import { test, expect, noErrorOnScreen, shot, PROJECT } from './fixtures';

const stamp = Date.now().toString(36);
const pkg = `e2e pkg ${stamp}`, sub = `e2e sub ${stamp}`, rule = `e2e foldered ${stamp}`;

test('Folders: create, nest, move rules in, rename, remove keeps rules', async ({ page }) => {
  // a rule to file away
  await page.goto(`projects/${PROJECT}/rules?new=1`);
  await page.locator('div.fixed button', { hasText: 'Formula' }).first().click();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.locator('form input').first().fill(rule);
  await page.getByRole('button', { name: /Create rule/ }).click();
  await page.waitForURL(/\/rules\/[^/?]+$/);
  await page.goto(`projects/${PROJECT}/rules`);

  const tree = page.getByRole('tree', { name: 'Folders' });
  const item = (n: string) => tree.getByRole('treeitem').filter({ hasText: n }).first();
  const row = page.locator('tbody tr').filter({ hasText: rule });

  // folder + sub-folder, inline (no browser prompt)
  await tree.getByRole('button', { name: 'New folder' }).click();
  await tree.getByLabel('Folder name').fill(pkg);
  await tree.getByLabel('Folder name').press('Enter');
  await expect(item(pkg)).toBeVisible();
  await item(pkg).hover();
  await tree.getByRole('button', { name: `Folder actions ${pkg}` }).click();
  await page.getByRole('menuitem', { name: 'New sub-folder' }).click();
  await tree.getByLabel('Folder name').fill(sub);
  await tree.getByLabel('Folder name').press('Enter');
  await expect(item(sub)).toBeVisible();

  // move with the folder picker in the row
  await row.getByRole('button', { name: `Folder of ${rule}` }).click();
  await page.getByRole('option', { name: `${pkg} / ${sub}` }).click();
  await expect(row.getByRole('button', { name: `Folder of ${rule}` })).toHaveText(new RegExp(sub));
  await expect(item(sub)).toContainText('1');

  // the parent folder lists the sub-folder's rules too
  await item(pkg).click();
  await expect(row).toHaveCount(1);
  await expect(page.locator('tbody tr')).toHaveCount(1);                                   // only what is filed under it
  await shot(page, '08-folders');

  // drag back to All rules
  await item('All rules').click();
  await row.dragTo(item('All rules'));
  await expect(row.getByRole('button', { name: `Folder of ${rule}` })).toHaveText('—');
  await row.dragTo(item(sub));
  await expect(row.getByRole('button', { name: `Folder of ${rule}` })).toHaveText(new RegExp(sub));

  // rename
  await item(pkg).hover();
  await tree.getByRole('button', { name: `Folder actions ${pkg}` }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await tree.getByLabel('Folder name').fill(`${pkg} renamed`);
  await tree.getByLabel('Folder name').press('Enter');
  await expect(item(`${pkg} renamed`)).toBeVisible();

  // remove the parent: sub-folder goes, the rule stays (back at the top level)
  await item(`${pkg} renamed`).hover();
  await tree.getByRole('button', { name: `Folder actions ${pkg} renamed` }).click();
  await page.getByRole('menuitem', { name: 'Remove' }).click();
  await page.getByRole('menuitem', { name: 'Remove folder' }).click();
  await expect(tree.getByText(pkg)).toHaveCount(0);
  await expect(tree.getByText(sub)).toHaveCount(0);
  await item('All rules').click();
  await expect(row).toHaveCount(1);
  await expect(row.getByRole('button', { name: `Folder of ${rule}` })).toHaveText('—');
  await noErrorOnScreen(page);
});
