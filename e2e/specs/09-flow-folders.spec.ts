// Decision Flows in folders: the same folder tree as rules; move a flow in (picker and drag-and-drop),
// a folder lists its sub-folders' flows, and removing a folder keeps the flow.
import { test, expect, noErrorOnScreen, shot, PROJECT } from './fixtures';

const stamp = Date.now().toString(36);
const pkg = `e2e fpkg ${stamp}`, sub = `e2e fsub ${stamp}`, flow = `e2e foldered flow ${stamp}`;

test('Flow folders: create, nest, move a flow in, filter, drag out, remove keeps the flow', async ({ page }) => {
  await page.goto(`projects/${PROJECT}/flows?kind=DECISION`);
  await page.getByRole('button', { name: /New decision flow/ }).first().click();
  await page.locator('div.fixed input').first().fill(flow);
  await page.getByRole('button', { name: /^Create$/ }).click();

  const tree = page.getByRole('tree', { name: 'Folders' });
  const item = (n: string) => tree.getByRole('treeitem').filter({ hasText: n }).first();
  const row = page.locator('tbody tr').filter({ hasText: flow });
  await expect(row).toHaveCount(1);
  await expect(item('All flows')).toBeVisible();

  await tree.getByRole('button', { name: 'New folder' }).click();
  await tree.getByLabel('Folder name').fill(pkg);
  await tree.getByLabel('Folder name').press('Enter');
  await item(pkg).hover();
  await tree.getByRole('button', { name: `Folder actions ${pkg}` }).click();
  await page.getByRole('menuitem', { name: 'New sub-folder' }).click();
  await tree.getByLabel('Folder name').fill(sub);
  await tree.getByLabel('Folder name').press('Enter');
  await expect(item(sub)).toBeVisible();

  // picker in the row moves it, without opening the flow
  await row.getByRole('button', { name: `Folder of ${flow}` }).click();
  await page.getByRole('option', { name: `${pkg} / ${sub}` }).click();
  await expect(page).toHaveURL(/\/flows\?kind=DECISION/);
  await expect(row.getByRole('button', { name: `Folder of ${flow}` })).toHaveText(new RegExp(sub));
  await expect(item(sub)).toContainText('1');

  await item(pkg).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await shot(page, '09-flow-folders');

  await item('All flows').click();
  await row.dragTo(item('All flows'));
  await expect(row.getByRole('button', { name: `Folder of ${flow}` })).toHaveText('—');
  await row.dragTo(item(sub));
  await expect(row.getByRole('button', { name: `Folder of ${flow}` })).toHaveText(new RegExp(sub));

  await item(pkg).hover();
  await tree.getByRole('button', { name: `Folder actions ${pkg}` }).click();
  await page.getByRole('menuitem', { name: 'Remove' }).click();
  await page.getByRole('menuitem', { name: 'Remove folder' }).click();
  await expect(tree.getByText(pkg)).toHaveCount(0);
  await item('All flows').click();
  await expect(row.getByRole('button', { name: `Folder of ${flow}` })).toHaveText('—');
  await noErrorOnScreen(page);
});
