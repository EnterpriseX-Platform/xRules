// Opens every screen from the sidebar and Settings; each must render its title with no API 5xx or page error.
import { test, expect, login, noErrorOnScreen, shot, PROJECT } from './fixtures';

const P = `projects/${PROJECT}`;
const PAGES: [string, string, RegExp][] = [
  ['dashboard', '', /Dashboard/],
  ['projects', 'projects', /Projects/],
  ['rules', `${P}/rules`, /Rules/],
  ['decision-flows', `${P}/flows?kind=DECISION`, /Decision Flows/],
  ['vocabulary', `${P}/vocabulary`, /Vocabulary/],
  ['bulk', `${P}/bulk`, /Bulk Runs/],
  ['simulations', `${P}/simulations`, /Simulations/],
  ['models', `${P}/models`, /Models/],
  ['releases', `${P}/releases`, /Releases/],
  ['approvals', `${P}/approvals`, /Approvals/],
  ['apis', `${P}/apis`, /REST APIs/],
  ['triggers', `${P}/triggers`, /Triggers/],
  ['data-sets', `${P}/data-sets`, /Data Sets/],
  ['connections', `${P}/integrations/connections`, /Connections/],
  ['api-keys', `${P}/integrations/api-keys`, /API Keys/],
  ['tests', `${P}/tests`, /Test Suites/],
  ['test-runs', `${P}/test-runs`, /Test Runs/],
  ['monitor', `${P}/monitor`, /Overview|Monitor/],
  ['traffic', `${P}/monitor/traffic`, /API Traffic/],
  ['decisions', `${P}/monitor/decisions`, /Decisions/],
  ['data-health', `${P}/monitor/data-health`, /Data Health/],
  ['alerts', `${P}/monitor/alerts`, /Alerts/],
  ['executions', `${P}/executions`, /Executions/],
  ['audit', `${P}/audit`, /Audit/],
  ['access', `${P}/access`, /Members & Access/],
  ['settings', 'settings', /Settings/],
  ['tenant', 'settings/tenant', /NEB Budget Bureau|Tenant/],
];


for (const [name, path, title] of PAGES) {
  test(`page ${name}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('main h1').first()).toHaveText(title);
    await page.waitForTimeout(2500); // let queries settle (some pages poll, so no networkidle)
    await noErrorOnScreen(page);
    await shot(page, `01-${name}`);
  });
}
