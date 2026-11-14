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
  ['approvals', `projects/_all/approvals`, /Approvals/],
  ['apis', `projects/_integration/apis`, /REST APIs/],
  ['triggers', `projects/_integration/triggers`, /Triggers/],
  ['data-sets', `projects/_integration/data-sets`, /Data Sets/],
  ['connections', `projects/_integration/integrations/connections`, /Connections/],
  ['api-keys', `projects/_integration/integrations/api-keys`, /API Keys/],
  ['tests', `projects/_all/tests`, /Test Suites/],
  ['test-runs', `projects/_all/test-runs`, /Test Runs/],
  ['monitor', `projects/_all/monitor`, /Overview|Monitor/],
  ['traffic', `projects/_all/monitor/traffic`, /API Traffic/],
  ['decisions', `projects/_all/monitor/decisions`, /Decisions/],
  ['data-health', `projects/_all/monitor/data-health`, /Data Health/],
  ['alerts', `projects/_all/monitor/alerts`, /Alerts/],
  ['executions', `projects/_all/executions`, /Executions/],
  ['audit', `projects/_all/audit`, /Audit/],
  ['access', `${P}/access`, /Members & Access/],
  ['settings', 'settings', /Settings/],
  ['tenant', 'settings/tenant', /.+/],
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
