// Module boundaries of the API. Each module owns these route prefixes (mounted in routes/index.ts) and the
// services/platform files under them; the studio's lib/modules.ts lists the same modules for the menu.
// `editableInProduction: false` = in a PRODUCTION environment the module is read-only (view, run, trace,
// compare); changes arrive only through a promoted release, live parameters or a rollback.
export interface ApiModule { id: string; prefixes: string[]; editableInProduction: boolean }

export const API_MODULES: ApiModule[] = [
  { id: 'decisions', editableInProduction: false, prefixes: ['/rules', '/folders', '/platform/topics', '/platform/library', '/platform/product-settings', '/platform/links'] },
  { id: 'data', editableInProduction: false, prefixes: ['/platform/vocabulary', '/platform/value-sets', '/platform/reasons', '/datasets', '/data', '/platform/datasets'] },
  { id: 'models', editableInProduction: false, prefixes: ['/models', '/platform/ml'] },
  { id: 'testing', editableInProduction: true, prefixes: ['/test-suites', '/scenarios', '/simulations', '/platform/tests', '/platform/bulk'] },
  { id: 'integration', editableInProduction: false, prefixes: ['/platform/specs', '/platform/operations', '/flows', '/connections', '/platform/triggers', '/jobs', '/tools'] },
  { id: 'release', editableInProduction: true, prefixes: ['/platform/reviews', '/releases', '/environments', '/platform/ops', '/platform/live-params'] },
  { id: 'monitor', editableInProduction: true, prefixes: ['/platform/monitor', '/executions', '/analytics', '/bi'] },
];

export const currentEnvironment = () => (process.env.XRULES_ENV || 'UAT').toUpperCase();
export const isProduction = () => ['PROD', 'PRODUCTION'].includes(currentEnvironment());

export function moduleOf(path: string): ApiModule | null {
  let best: ApiModule | null = null; let len = -1;
  for (const m of API_MODULES) for (const p of m.prefixes) if ((path === p || path.startsWith(p + '/')) && p.length > len) { best = m; len = p.length; }
  return best;
}

// running, tracing, testing and comparing never change anything, so they stay open in production
const READ_LIKE = /\/(run|try|trace|compare|simulate|execute|test|tests\/run|preview|validate)(\/|$)/;

/** Express middleware: in production, writes to Decisions / Data / Models / Integration are refused. */
export function productionReadOnly(req: any, res: any, next: any) {
  if (!isProduction() || req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const m = moduleOf(req.path);
  if (!m || m.editableInProduction || READ_LIKE.test(req.path)) return next();
  res.status(403).json({ success: false, error: { code: 'PRODUCTION_READ_ONLY', message: 'Production is read-only: make the change in UAT and promote a release, or use Live parameters' } });
}
