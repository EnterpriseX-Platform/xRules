// Load test for the public execute endpoints: one rule of each fast kind and a decision flow
// (transform → run together [table + scorecard] → branch → output), called with an API key.
// Usage: XR_EMAIL=… XR_PASSWORD=… node --experimental-strip-types perf/load.mjs [base=http://localhost:4400] [seconds=20]
// Everything it creates is named e2e… / e2e-key-… so cleanup-uat.sql removes it.
const BASE = process.argv[2] || 'http://localhost:4400';
const SECS = Number(process.argv[3] || 20);
const PROJECT = process.env.XR_PROJECT || 'neb-pre-screening';
const TENANT = process.env.XR_TENANT || 'neb-budget-bureau';
const stamp = Date.now().toString(36);
const { TEMPLATES } = await import('../../apps/xrules-studio/src/lib/templates.ts');

let token;
async function api(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', 'X-Tenant': TENANT, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body && JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`);
  return j.data ?? j;
}
const login = await api('POST', '/auth/login', { email: process.env.XR_EMAIL, password: process.env.XR_PASSWORD });
token = login.accessToken || login.access_token || login.token;
const T = s => TEMPLATES.find(t => t.slug === s);
const mk = async (name, s) => { const t = T(s); return (await api('POST', '/rules', { name, type: t.type, projectId: PROJECT, definition: t.definition, input_schema: t.inputSchema, output_schema: t.outputSchema })).slug; };
const table = await mk(`e2e perf table ${stamp}`, 'discount-tiers');
const score = await mk(`e2e perf scorecard ${stamp}`, 'fraud-score');
const tree = await mk(`e2e perf tree ${stamp}`, 'kyc-tier');
const ret = { return: { orderAmount: '{{orderAmount}}', checks: '{{checks}}', result: '{{result}}' } };
const flow = await api('POST', '/flows', { name: `e2e perf flow ${stamp}`, projectId: PROJECT, graph: {
  nodes: [
    { id: 'in', type: 'input', data: {} },
    { id: 'tx', type: 'transform', data: { target: 'orderAmount', expression: 'input.qty * input.price' } },
    { id: 'par', type: 'parallel', data: { outputAs: 'checks' } },
    { id: 'r1', type: 'ruleCall', data: { ruleSlug: table, outputAs: 'disc', inputMap: { customerTier: '{{input.customerTier}}', orderAmount: '{{orderAmount}}' } } },
    { id: 'r2', type: 'ruleCall', data: { ruleSlug: score, outputAs: 'fraud' } },
    { id: 'm', type: 'merge', data: {} },
    { id: 'b', type: 'branch', data: { condition: "checks.r2.decision === 'block'" } },
    { id: 's', type: 'transform', data: { target: 'result', expression: "'stop'" } },
    { id: 'g', type: 'transform', data: { target: 'result', expression: "'go'" } },
    { id: 'o1', type: 'output', data: ret }, { id: 'o2', type: 'output', data: ret },
  ],
  edges: [
    { source: 'in', target: 'tx' }, { source: 'tx', target: 'par' },
    { source: 'par', target: 'r1', sourceHandle: 'r1' }, { source: 'par', target: 'r2', sourceHandle: 'r2' },
    { source: 'r1', target: 'm' }, { source: 'r2', target: 'm' }, { source: 'm', target: 'b' },
    { source: 'b', target: 's', sourceHandle: 'true' }, { source: 'b', target: 'g', sourceHandle: 'false' },
    { source: 's', target: 'o1' }, { source: 'g', target: 'o2' },
  ] } });
await api('POST', `/flows/${flow.id}/publish`, {});
for (const s of [table, score, tree]) { const r = (await api('GET', `/rules/${s}`)); await api('POST', `/rules/${r.id}/publish`, {}).catch(() => {}); }
const key = (await api('POST', '/api-keys', { name: `e2e-key-perf-${stamp}`, scopes: ['execute'], workspaceSlug: TENANT, rateLimitPerMin: 1000000 })).key;

const tiers = ['platinum', 'gold', 'silver', 'bronze'], risk = ['low', 'medium', 'high'];
const rnd = a => a[Math.floor(Math.random() * a.length)];
const targets = {
  'Decision Table': { path: `/api/v1/rules/${table}/execute`, body: () => ({ input: { customerTier: rnd(tiers), orderAmount: Math.random() * 2000 } }) },
  'Scorecard':      { path: `/api/v1/rules/${score}/execute`, body: () => ({ input: { countryRisk: rnd(risk), velocityHourly: Math.random() * 15, newDevice: Math.random() < .3, amount: Math.random() * 30000 } }) },
  'Decision Tree':  { path: `/api/v1/rules/${tree}/execute`,  body: () => ({ input: { country: rnd(['TH', 'IR', 'SG']), occupation: 'x', monthlyAmount: Math.random() * 90000 } }) },
  'Decision Flow (2 rules)': { path: `/api/v1/flows/${flow.slug}/execute`, body: () => ({ input: { qty: 1 + Math.floor(Math.random() * 5), price: Math.random() * 800, customerTier: rnd(tiers), countryRisk: rnd(risk), velocityHourly: Math.random() * 15, newDevice: false, amount: Math.random() * 30000 } }) },
};

async function hit(t) {
  const t0 = performance.now();
  try {
    const r = await fetch(BASE + t.path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': key }, body: JSON.stringify(t.body()) });
    await r.arrayBuffer();
    return { ms: performance.now() - t0, ok: r.ok, status: r.status };
  } catch (e) { return { ms: performance.now() - t0, ok: false, status: 'net' }; }
}
async function stage(name, conc, secs) {
  const t = targets[name], lat = [], errs = {}; const end = Date.now() + secs * 1000;
  await Promise.all(Array.from({ length: conc }, async () => { while (Date.now() < end) { const r = await hit(t); lat.push(r.ms); if (!r.ok) errs[r.status] = (errs[r.status] || 0) + 1; } }));
  lat.sort((a, b) => a - b); const q = p => lat[Math.min(lat.length - 1, Math.floor(lat.length * p))]?.toFixed(0);
  const bad = Object.values(errs).reduce((a, b) => a + b, 0);
  return { name, conc, reqs: lat.length, rps: (lat.length / secs).toFixed(0), p50: q(.5), p95: q(.95), p99: q(.99), max: lat.at(-1)?.toFixed(0), errPct: ((bad / Math.max(1, lat.length)) * 100).toFixed(2), errs: JSON.stringify(errs) };
}

for (const [n, t] of Object.entries(targets)) if (!process.env.ONLY || n.startsWith(process.env.ONLY)) for (let i = 0; i < 20; i++) await hit(t);   // warm up
const rows = [];
for (const name of Object.keys(targets).filter(n => !process.env.ONLY || n.startsWith(process.env.ONLY))) for (const conc of (process.env.CONC || "1,10,50,100").split(",").map(Number)) {
  const r = await stage(name, conc, SECS); rows.push(r);
  console.log([r.name, `c=${r.conc}`, `${r.rps}/s`, `p50 ${r.p50}`, `p95 ${r.p95}`, `p99 ${r.p99}`, `max ${r.max}`, `err ${r.errPct}%`, r.errs].join(' | '));
}
console.log('JSON ' + JSON.stringify(rows));
