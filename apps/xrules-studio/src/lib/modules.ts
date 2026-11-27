// The product's modules. One entry per module: the project menu section, the backend route prefixes it owns and
// the image/Jenkins COMPONENT it ships in. The menu, the backend module registry and the build docs read this list.
export type ModuleId = 'decisions' | 'data' | 'models' | 'testing' | 'integration' | 'release' | 'monitor';
export type Audience = 'business' | 'developer';

export interface ModuleItem { path: string; label: string; icon: string; audience?: Audience; perm?: 'integrate' | 'admin' }
export interface ModuleDef { id: ModuleId; label: string; audience: Audience; component: string; api: string[]; items: ModuleItem[] }

export const MODULES: ModuleDef[] = [
  { id: 'decisions', label: 'Decisions', audience: 'business', component: 'api', api: ['/platform/topics', '/rules', '/platform/library', '/platform/product-settings'], items: [
    { path: 'topics', label: 'Topics', icon: 'FolderKanban' },
    { path: 'rules', label: 'Rules', icon: 'FileText', audience: 'developer' },
    { path: 'library', label: 'Library', icon: 'Library' },
    { path: 'product-settings', label: 'Product settings', icon: 'Table2' },
  ] },
  { id: 'data', label: 'Data & vocabulary', audience: 'business', component: 'api', api: ['/platform/vocabulary', '/platform/value-sets', '/platform/reasons', '/platform/datasets'], items: [
    { path: 'vocabulary', label: 'Words', icon: 'BookA' },
    { path: 'vocabulary/values', label: 'Value sets', icon: 'ListTree' },
    { path: 'vocabulary/reasons', label: 'Reason codes', icon: 'ListChecks' },
    { path: 'data-sets', label: 'Data sets', icon: 'Layers', audience: 'developer' },
  ] },
  { id: 'models', label: 'Models', audience: 'developer', component: 'ml', api: ['/models', '/platform/ml'], items: [
    { path: 'models', label: 'Models', icon: 'Box' },
  ] },
  { id: 'testing', label: 'Testing & simulation', audience: 'business', component: 'api', api: ['/test-suites', '/platform/tests', '/platform/bulk', '/simulations'], items: [
    { path: 'tests', label: 'Test suites', icon: 'FlaskConical' },
    { path: 'test-runs', label: 'Test runs', icon: 'ListChecks' },
    { path: 'bulk', label: 'Bulk runs', icon: 'Rows3', audience: 'developer' },
    { path: 'simulations', label: 'Simulations', icon: 'GitCompare' },
  ] },
  { id: 'integration', label: 'Integration', audience: 'developer', component: 'api', api: ['/platform/specs', '/flows', '/connections', '/platform/triggers', '/api'], items: [
    { path: 'apis', label: 'REST APIs', icon: 'Zap' },
    { path: 'flows?kind=DECISION', label: 'Decision flows', icon: 'Workflow' },
    { path: 'connections', label: 'Connections', icon: 'Database' },
    { path: 'triggers', label: 'Triggers', icon: 'Timer' },
  ] },
  { id: 'release', label: 'Release & governance', audience: 'business', component: 'api', api: ['/platform/reviews', '/releases', '/environments', '/platform/ops'], items: [
    { path: 'approvals', label: 'Approvals', icon: 'BadgeCheck' },
    { path: 'releases', label: 'Releases', icon: 'ScrollText' },
    { path: 'live-parameters', label: 'Live parameters', icon: 'Gauge' },
    { path: 'bundles', label: 'Export / Import', icon: 'GitBranch', audience: 'developer' },
    { path: 'environments', label: 'Environments', icon: 'Network', audience: 'developer' },
  ] },
  { id: 'monitor', label: 'Monitor', audience: 'business', component: 'api', api: ['/platform/monitor', '/executions'], items: [
    { path: 'monitor', label: 'Overview', icon: 'Gauge' },
    { path: 'monitor/traffic', label: 'API traffic', icon: 'Activity' },
    { path: 'monitor/decisions', label: 'Decisions', icon: 'PieChart' },
    { path: 'monitor/data-health', label: 'Data health', icon: 'HeartPulse' },
    { path: 'monitor/alerts', label: 'Alerts', icon: 'Bell' },
    { path: 'executions', label: 'Executions', icon: 'History' },
  ] },
];
