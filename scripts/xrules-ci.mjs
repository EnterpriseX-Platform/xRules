#!/usr/bin/env node
// xRules CI: keep a project's configuration in Git and move it QA → UAT → PROD.
//   XRULES_URL=https://…/xrules-api XRULES_TOKEN=… XRULES_TENANT=… node scripts/xrules-ci.mjs <command> …
//   pull <project> <dir> [--parts decisions,data,integration,testing] [--product X] [--release ID]
//                                      write the bundle as YAML files (folder per kind, file per object)
//   validate <project> <dir>           check the folder and say what an import would change (exit 1 on problems)
//   push <project> <dir> [--publish]   import the folder (drafts; --publish puts changed rules/flows live)
//   test <project> [--fail-on any|regressions]   run every test case (exit 1 on failures / regressions)
//   promote <releaseId> <QA|UAT|PROD>  pin a release to the next environment after the tests pass
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');

const [cmd, ...rest] = process.argv.slice(2);
const flags = {}; const args = [];
for (let i = 0; i < rest.length; i++) { const a = rest[i]; if (a.startsWith('--')) { const n = rest[i + 1]; if (n && !n.startsWith('--')) { flags[a.slice(2)] = n; i++; } else flags[a.slice(2)] = true; } else args.push(a); }
const flag = (n, d) => flags[n] ?? d;
const BASE = (process.env.XRULES_URL || 'http://localhost:4000').replace(/\/$/, '');
const headers = { Authorization: `Bearer ${process.env.XRULES_TOKEN || ''}`, ...(process.env.XRULES_TENANT ? { 'X-Tenant': process.env.XRULES_TENANT } : {}) };
const die = (m) => { console.error(m); process.exit(1); };
async function call(method, p, body) {
  const r = await fetch(`${BASE}${p}`, { method, headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get('content-type') || '';
  const out = ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
  return { status: r.status, out };
}
async function folderToZip(dir) {
  const zip = new JSZip();
  const walk = (d, rel = '') => { for (const f of fs.readdirSync(d)) { const full = path.join(d, f), r = rel ? `${rel}/${f}` : f; if (fs.statSync(full).isDirectory()) walk(full, r); else if (/\.ya?ml$/.test(f)) zip.file(r, fs.readFileSync(full)); } };
  walk(dir);
  return (await zip.generateAsync({ type: 'nodebuffer' })).toString('base64');
}

if (cmd === 'pull') {
  const [project, dir] = args; if (!project || !dir) die('pull <project> <dir>');
  const q = new URLSearchParams({ format: 'zip', project_id: project });
  for (const k of ['parts', 'product']) if (flag(k)) q.set(k, flag(k));
  if (flag('release')) { q.delete('project_id'); q.set('release_id', flag('release')); }
  const { status, out } = await call('GET', `/platform/ops/export?${q}`); if (status !== 200) die(JSON.stringify(out));
  const zip = await JSZip.loadAsync(out);
  // replace the kinds in the bundle so removed objects disappear from Git too
  for (const k of new Set(Object.keys(zip.files).filter(n => n.includes('/')).map(n => n.split('/')[0]))) fs.rmSync(path.join(dir, k), { recursive: true, force: true });
  for (const f of Object.values(zip.files)) { if (f.dir) continue; const to = path.join(dir, f.name); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, await f.async('nodebuffer')); }
  console.log(`Wrote ${Object.values(zip.files).filter(f => !f.dir).length} files to ${dir}`);
} else if (cmd === 'validate' || cmd === 'push') {
  const [project, dir] = args; if (!project || !dir) die(`${cmd} <project> <dir>`);
  const zip = await folderToZip(dir);
  if (cmd === 'validate') {
    const { status, out } = await call('POST', '/platform/ops/validate', { projectId: project, zip }); if (status !== 200) die(JSON.stringify(out));
    const v = out.data; v.problems.forEach(p => console.log(`problem: ${p}`)); if (v.preview) console.log(`would import: ${JSON.stringify(v.preview)}`);
    process.exit(v.ok ? 0 : 1);
  }
  const { status, out } = await call('POST', '/platform/ops/import', { projectId: project, zip, publish: flag('publish') === true, message: flag('message') }); if (status !== 200) die(JSON.stringify(out));
  console.log(`Imported ${out.data.applied.length} objects${out.data.notImported.length ? `; not imported: ${out.data.notImported.map(r => r.key).join(', ')}` : ''}`);
} else if (cmd === 'test') {
  const [project] = args; if (!project) die('test <project>');
  const { out } = await call('POST', '/platform/ops/test', { projectId: project, failOn: flag('fail-on', 'any') });
  const d = out.data || out; console.log(`${d.passed}/${d.total} pass · ${d.regressions} regressions`); (d.results || []).forEach(r => console.log(`${r.regression ? 'REGRESSION' : 'FAIL'} ${r.targetType} ${r.name}`));
  process.exit(d.ok ? 0 : 1);
} else if (cmd === 'promote') {
  const [releaseId, to] = args; if (!releaseId || !to) die('promote <releaseId> <QA|UAT|PROD>');
  const { status, out } = await call('POST', '/platform/ops/promote', { releaseId, to }); if (status !== 200) die(JSON.stringify(out));
  console.log(`${out.data.release} → ${out.data.environment}`);
} else {
  die('usage: xrules-ci.mjs pull|validate|push|test|promote …');
}
