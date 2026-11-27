// Release & governance: config bundles (export / import with a preview), release snapshots, compare, rollback,
// live parameters and the CI endpoints (validate, test, promote).
//
// A bundle holds every object of a project keyed by a stable name (word term, value set name, reason code, setting
// name, topic name, rule / flow / API slug), never by database id, so it reads the same in every environment and in Git.
import JSZip from 'jszip';
import YAML from 'yaml';
import { prisma } from '../config/database.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import { assertProjectAccess } from '../services/_access.js';
import type { AuthUser } from '../middleware/auth.js';
import { currentEnvironment } from '../modules/index.js';

export const KINDS = ['words', 'valueSets', 'reasonCodes', 'productSettings', 'topics', 'rules', 'flows', 'apis', 'testCases', 'connections'] as const;
export type Kind = typeof KINDS[number];
/** parts a deployment can carry on its own; a kind name works too */
export const PARTS: Record<string, Kind[]> = {
  decisions: ['topics', 'rules', 'productSettings'],
  data: ['words', 'valueSets', 'reasonCodes'],
  integration: ['flows', 'apis', 'connections'],
  testing: ['testCases'],
};
export interface Bundle {
  format: 'xrules-bundle'; version: 1; exportedAt: string;
  source: { projectId: string; project: string; environment: string; release?: string | null; product?: string | null };
  parts: Partial<Record<Kind, any[]>>;
}

const kindsFor = (parts?: string | string[] | null): Kind[] => {
  const list = (Array.isArray(parts) ? parts : String(parts || '').split(',')).map(s => s.trim()).filter(Boolean);
  if (!list.length) return [...KINDS];
  const out = new Set<Kind>();
  for (const p of list) { if (PARTS[p]) PARTS[p].forEach(k => out.add(k)); else if ((KINDS as readonly string[]).includes(p)) out.add(p as Kind); else throw new ValidationError(`Unknown part "${p}": use ${[...Object.keys(PARTS), ...KINDS].join(', ')}`); }
  return KINDS.filter(k => out.has(k));
};
const strip = (o: any) => JSON.parse(JSON.stringify(o ?? null));

// ---------------------------------------------------------------------------------------------- build
async function build(projectId: string, opts: { product?: string | null; kinds?: Kind[] } = {}) {
  const kinds = opts.kinds || [...KINDS];
  const want = (k: Kind) => kinds.includes(k);
  const stamps = new Map<string, Date>();
  const stamp = (k: Kind, key: string, d: Date) => stamps.set(`${k}:${key}`, d);
  const parts: Bundle['parts'] = {};
  const product = opts.product || null;

  const topicsAll = await prisma.topic.findMany({ where: { projectId, deletedAt: null }, orderBy: { createdAt: 'asc' } });
  const topics = product ? topicsAll.filter(t => t.product === product) : topicsAll;
  const topicName = new Map(topicsAll.map(t => [t.id, t.name]));
  const topicIds = new Set(topics.map(t => t.id));
  const rulesAll = await prisma.rule.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } });
  const rules = product ? rulesAll.filter(r => r.library || (r.topicId && topicIds.has(r.topicId))) : rulesAll;
  const flowsAll = await prisma.flow.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } });
  const flows = product ? flowsAll.filter(f => f.topicId && topicIds.has(f.topicId)) : flowsAll;
  const ruleSlug = new Map(rulesAll.map(r => [r.id, r.slug])); const flowSlug = new Map(flowsAll.map(f => [f.id, f.slug]));

  if (want('valueSets')) parts.valueSets = (await prisma.valueSet.findMany({ where: { projectId, deletedAt: null }, orderBy: { name: 'asc' } }))
    .map(v => { stamp('valueSets', v.name, v.updatedAt); return { key: v.name, columns: v.columns, rows: v.rows, groups: v.groups }; });
  const sets = new Map((await prisma.valueSet.findMany({ where: { projectId } })).map(v => [v.id, v.name]));
  if (want('words')) parts.words = (await prisma.vocabularyTerm.findMany({ where: { projectId, deletedAt: null }, orderBy: { term: 'asc' } }))
    .map(w => { stamp('words', w.term, w.updatedAt); return { key: w.term, path: w.path, type: w.type, values: w.values, description: w.description, unit: w.unit, valueSet: w.valueSetId ? sets.get(w.valueSetId) || null : null, aggregate: w.aggregate }; });
  if (want('reasonCodes')) parts.reasonCodes = (await prisma.reasonCode.findMany({ where: { projectId, deletedAt: null }, orderBy: { code: 'asc' } }))
    .map(c => { stamp('reasonCodes', c.code, c.updatedAt); return { key: c.code, text: c.text, outcome: c.outcome, result: c.result, priority: c.priority }; });
  if (want('productSettings')) parts.productSettings = (await prisma.productSetting.findMany({ where: { projectId, deletedAt: null }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }))
    .map(s => { stamp('productSettings', s.name, s.updatedAt); const v: any = s.values || {}; return { key: s.name, tunable: !!(s as any).tunable, values: product ? (product in v ? { [product]: v[product] } : {}) : v }; });
  if (want('topics')) parts.topics = topics.map(t => { stamp('topics', t.name, t.updatedAt); return { key: t.name, description: t.description, goal: t.goal, shape: t.shape, stages: t.stages, product: t.product, settings: t.settings }; });
  if (want('rules')) parts.rules = rules.map(r => { stamp('rules', r.slug, r.updatedAt); return {
    key: r.slug, name: r.name, alias: r.alias, description: r.description, type: r.type, topic: r.topicId ? topicName.get(r.topicId) || null : null,
    library: r.library, libraryRef: r.libraryRef, definition: r.definition, inputSchema: r.inputSchema, outputSchema: r.outputSchema, tags: r.tags, status: r.status, version: r.version }; });
  if (want('flows')) parts.flows = flows.map(f => { stamp('flows', f.slug, f.updatedAt); return {
    key: f.slug, name: f.name, kind: f.kind, description: f.description, topic: f.topicId ? topicName.get(f.topicId) || null : null,
    graph: f.graph, inputSchema: f.inputSchema, outputSchema: f.outputSchema, schedule: f.schedule, status: f.status, version: f.version }; });
  if (want('apis') && !product) parts.apis = (await prisma.apiSpec.findMany({ where: { projectId }, include: { operations: true }, orderBy: { name: 'asc' } }))
    .map(s => { stamp('apis', s.slug, s.updatedAt); return { key: s.slug, name: s.name, basePath: s.basePath, version: s.version, description: s.description, status: s.status,
      operations: s.operations.sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`)).map(o => ({ method: o.method, path: o.path, summary: o.summary, requestSchema: o.requestSchema, responseSchema: o.responseSchema, flow: flowSlug.get(o.flowId) || null })) }; });
  if (want('testCases')) {
    const cases = await prisma.testCase.findMany({ where: { projectId, deletedAt: null }, orderBy: { name: 'asc' } });
    parts.testCases = cases.map(c => {
      const target = c.targetType === 'topic' ? topicName.get(c.targetId || '') : c.targetType === 'rule' ? ruleSlug.get(c.targetId || c.ruleId || '') : c.targetType === 'decision_flow' ? flowSlug.get(c.targetId || '') : c.targetId;
      return { c, target };
    }).filter(({ c, target }) => target && (!product || (c.targetType === 'topic' ? topics.some(t => t.name === target) : c.targetType === 'rule' ? rules.some(r => r.slug === target) : flows.some(f => f.slug === target))))
      .map(({ c, target }) => { const key = `${c.targetType}/${target}/${c.name}`; stamp('testCases', key, c.updatedAt); return { key, targetType: c.targetType, target, name: c.name, input: c.input, expectations: c.expectations ?? (c.expected ? [{ kind: 'equals', path: '$', value: c.expected }] : []) }; });
  }
  // connections travel without secrets: each environment keeps its own host, user and password
  if (want('connections') && !product) parts.connections = (await prisma.connection.findMany({ where: { projectId }, orderBy: { slug: 'asc' } }))
    .map(c => { stamp('connections', c.slug, c.updatedAt); return { key: c.slug, name: c.name, type: c.type }; });
  for (const k of Object.keys(parts) as Kind[]) parts[k] = strip(parts[k]);
  return { parts, stamps };
}

export async function exportBundle(q: { projectId?: string; product?: string; releaseId?: string; parts?: string }, user: AuthUser): Promise<Bundle> {
  if (q.releaseId) {
    const rel = await prisma.release.findUnique({ where: { id: q.releaseId } }); if (!rel) throw new NotFoundError('Release');
    await assertProjectAccess(rel.projectId, user);
    const b = (rel.manifest as any)?.bundle as Bundle | undefined;
    if (!b) throw new ValidationError(`Release ${rel.name} was made before releases held a full snapshot: it lists versions only`);
    const kinds = kindsFor(q.parts);
    return { ...b, parts: Object.fromEntries(kinds.filter(k => b.parts[k]).map(k => [k, b.parts[k]])) as any };
  }
  const p = await assertProjectAccess(String(q.projectId), user);
  const { parts } = await build(p.id, { product: q.product || null, kinds: kindsFor(q.parts) });
  return { format: 'xrules-bundle', version: 1, exportedAt: new Date().toISOString(), source: { projectId: p.id, project: p.name, environment: currentEnvironment(), product: q.product || null }, parts };
}

// ---------------------------------------------------------------------------------------------- files
const fileName = (key: string) => key.replace(/[^\p{L}\p{N}._ -]+/gu, '_').trim().slice(0, 120) || '_';
/** A zip of readable YAML: bundle.yaml plus one folder per kind and one file per object (fits a Git repository). */
export async function toZip(b: Bundle): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('bundle.yaml', YAML.stringify({ format: b.format, version: b.version, exportedAt: b.exportedAt, source: b.source, kinds: Object.keys(b.parts) }));
  for (const [k, items] of Object.entries(b.parts)) {
    const used = new Set<string>();
    for (const it of items || []) { let n = fileName(it.key); while (used.has(n)) n += '_'; used.add(n); zip.file(`${k}/${n}.yaml`, YAML.stringify(it, { lineWidth: 0 })); }
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
export async function fromZip(buf: Buffer): Promise<Bundle> {
  const zip = await JSZip.loadAsync(buf);
  const headFile = zip.file('bundle.yaml'); if (!headFile) throw new ValidationError('bundle.yaml is missing from the zip');
  const head = YAML.parse(await headFile.async('string'));
  const parts: any = {};
  for (const f of Object.values(zip.files)) {
    const m = f.name.match(/^([A-Za-z]+)\/(.+)\.ya?ml$/); if (!m || f.dir) continue;
    if (!(KINDS as readonly string[]).includes(m[1])) continue;
    (parts[m[1]] ||= []).push(YAML.parse(await f.async('string')));
  }
  for (const k of Object.keys(parts)) parts[k].sort((a: any, b: any) => String(a.key).localeCompare(String(b.key)));
  return { ...head, parts };
}
/** Accept a bundle as JSON, YAML text or base64 zip. */
export async function readBundle(body: any): Promise<Bundle> {
  let b: any = body?.bundle ?? body;
  if (typeof body?.zip === 'string') b = await fromZip(Buffer.from(body.zip, 'base64'));
  else if (typeof b === 'string') b = YAML.parse(b);
  validateShape(b);
  return b;
}
function validateShape(b: any) {
  if (!b || b.format !== 'xrules-bundle' || !b.parts || typeof b.parts !== 'object') throw new ValidationError('Not an xRules bundle (format: xrules-bundle)');
  for (const [k, items] of Object.entries(b.parts)) {
    if (!(KINDS as readonly string[]).includes(k)) throw new ValidationError(`Unknown kind "${k}" in the bundle`);
    if (!Array.isArray(items)) throw new ValidationError(`${k} must be a list`);
    const keys = new Set<string>();
    for (const it of items as any[]) { if (!it?.key) throw new ValidationError(`An item in ${k} has no key`); if (keys.has(it.key)) throw new ValidationError(`${k}: "${it.key}" is in the bundle twice`); keys.add(it.key); }
  }
}

// ---------------------------------------------------------------------------------------------- compare
const same = (a: any, b: any) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
// compare content, not bookkeeping: version and status move on every publish
function norm(o: any): any { if (!o || typeof o !== 'object') return o; if (Array.isArray(o)) return o.map(norm); const { version: _v, status: _s, ...rest } = o; return Object.fromEntries(Object.keys(rest).sort().map(k => [k, norm(rest[k])])); }
function fieldsChanged(a: any, b: any) { const ks = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]); return Array.from(ks).filter(k => k !== 'key' && k !== 'version' && k !== 'status' && JSON.stringify(norm(a?.[k])) !== JSON.stringify(norm(b?.[k]))); }

export function diff(from: Bundle['parts'], to: Bundle['parts']) {
  const out: { kind: Kind; key: string; change: 'added' | 'removed' | 'changed'; fields?: string[] }[] = [];
  for (const k of KINDS) {
    if (!from[k] && !to[k]) continue;
    const a = new Map((from[k] || []).map(x => [x.key, x])); const b = new Map((to[k] || []).map(x => [x.key, x]));
    for (const [key, x] of b) { const y = a.get(key); if (!y) out.push({ kind: k, key, change: 'added' }); else if (!same(x, y)) out.push({ kind: k, key, change: 'changed', fields: fieldsChanged(y, x) }); }
    for (const key of a.keys()) if (!b.has(key) && to[k]) out.push({ kind: k, key, change: 'removed' });
  }
  return out;
}

/** What an import would do: added / changed / unchanged, and conflicts (changed here after the bundle was exported). */
export async function previewImport(projectId: string, bundle: Bundle, user: AuthUser) {
  const p = await assertProjectAccess(projectId, user, 'write');
  const kinds = KINDS.filter(k => bundle.parts[k]);
  const { parts, stamps } = await build(p.id, { kinds, product: bundle.source?.product || null });
  const exported = new Date(bundle.exportedAt || 0);
  const rows: { kind: Kind; key: string; change: 'added' | 'changed' | 'unchanged' | 'conflict' | 'not imported'; fields?: string[]; note?: string }[] = [];
  for (const k of kinds) {
    const here = new Map((parts[k] || []).map(x => [x.key, x]));
    for (const it of bundle.parts[k] || []) {
      const h = here.get(it.key);
      if (k === 'connections') { rows.push(h ? { kind: k, key: it.key, change: 'unchanged' } : { kind: k, key: it.key, change: 'not imported', note: 'Create this connection here with its own settings' }); continue; }
      if (!h) { rows.push({ kind: k, key: it.key, change: 'added' }); continue; }
      if (same(h, it)) { rows.push({ kind: k, key: it.key, change: 'unchanged' }); continue; }
      const st = stamps.get(`${k}:${it.key}`);
      rows.push({ kind: k, key: it.key, change: st && st > exported && bundle.source?.projectId === p.id ? 'conflict' : 'changed', fields: fieldsChanged(h, it), note: st && st > exported ? `Changed here ${st.toISOString()}, after the bundle was exported` : undefined });
    }
  }
  const count = (c: string) => rows.filter(r => r.change === c).length;
  return { project: { id: p.id, name: p.name }, source: bundle.source, exportedAt: bundle.exportedAt, summary: { added: count('added'), changed: count('changed'), conflict: count('conflict'), unchanged: count('unchanged'), notImported: count('not imported') }, rows };
}

// ---------------------------------------------------------------------------------------------- apply
/**
 * Write a bundle into a project: create or update by key, never delete. `skip` = "kind:key" left as they are
 * (conflicts the user chose to keep). `publish` = changed rules and flows go live (rollback, promote).
 */
export async function applyBundle(projectId: string, bundle: Bundle, user: AuthUser, opts: { skip?: string[]; publish?: boolean; message?: string } = {}) {
  const p = await assertProjectAccess(projectId, user, 'write');
  const skip = new Set(opts.skip || []);
  const preview = await previewImport(p.id, bundle, user);
  const todo = new Set(preview.rows.filter(r => r.change === 'added' || r.change === 'changed' || r.change === 'conflict').map(r => `${r.kind}:${r.key}`).filter(k => !skip.has(k)));
  const go = (k: Kind, key: string) => todo.has(`${k}:${key}`);
  const done: string[] = [];
  const P = bundle.parts;

  for (const v of P.valueSets || []) if (go('valueSets', v.key)) {
    const hit = await prisma.valueSet.findFirst({ where: { projectId: p.id, name: v.key, deletedAt: null } });
    const data = { columns: v.columns || [], rows: v.rows ?? [], groups: v.groups ?? {} };
    if (hit) await prisma.valueSet.update({ where: { id: hit.id }, data: { ...data, version: hit.version + 1 } }); else await prisma.valueSet.create({ data: { projectId: p.id, name: v.key, ...data } });
    done.push(`valueSets:${v.key}`);
  }
  const sets = new Map((await prisma.valueSet.findMany({ where: { projectId: p.id, deletedAt: null } })).map(v => [v.name, v.id]));
  for (const w of P.words || []) if (go('words', w.key)) {
    const data = { path: w.path || w.key, type: w.type || 'text', values: w.values || [], description: w.description ?? null, unit: w.unit ?? null, valueSetId: w.valueSet ? sets.get(w.valueSet) || null : null, aggregate: w.aggregate ?? undefined };
    await prisma.vocabularyTerm.upsert({ where: { projectId_term: { projectId: p.id, term: w.key } }, update: { ...data, deletedAt: null }, create: { projectId: p.id, term: w.key, ...data } });
    done.push(`words:${w.key}`);
  }
  for (const c of P.reasonCodes || []) if (go('reasonCodes', c.key)) {
    const hit = await prisma.reasonCode.findFirst({ where: { projectId: p.id, code: c.key, deletedAt: null } });
    const data = { text: c.text || '', outcome: c.outcome || 'Decline', result: c.result ?? null, priority: c.priority ?? 100 };
    if (hit) await prisma.reasonCode.update({ where: { id: hit.id }, data }); else await prisma.reasonCode.create({ data: { projectId: p.id, code: c.key, ...data } });
    done.push(`reasonCodes:${c.key}`);
  }
  for (const s of P.productSettings || []) if (go('productSettings', s.key)) {
    const hit = await prisma.productSetting.findFirst({ where: { projectId: p.id, deletedAt: null, name: { equals: s.key, mode: 'insensitive' } } });
    // a product bundle carries one product's column: the other products keep their values
    const values = bundle.source?.product && hit ? { ...((hit.values as any) || {}), ...(s.values || {}) } : (s.values || {});
    if (hit) await prisma.productSetting.update({ where: { id: hit.id }, data: { values, tunable: !!s.tunable } as any });
    else await prisma.productSetting.create({ data: { projectId: p.id, name: s.key, values, tunable: !!s.tunable, position: await prisma.productSetting.count({ where: { projectId: p.id, deletedAt: null } }) } as any });
    done.push(`productSettings:${s.key}`);
  }
  for (const t of P.topics || []) if (go('topics', t.key)) {
    const hit = await prisma.topic.findFirst({ where: { projectId: p.id, name: t.key, deletedAt: null } });
    const data = { description: t.description ?? null, goal: t.goal ?? null, shape: t.shape || 'questions', stages: t.stages ?? undefined, product: t.product ?? null, settings: t.settings ?? undefined };
    if (hit) await prisma.topic.update({ where: { id: hit.id }, data }); else await prisma.topic.create({ data: { projectId: p.id, name: t.key, createdById: user.userId, ...data } });
    done.push(`topics:${t.key}`);
  }
  const topicId = new Map((await prisma.topic.findMany({ where: { projectId: p.id, deletedAt: null } })).map(t => [t.name, t.id]));
  for (const r of P.rules || []) if (go('rules', r.key)) {
    const hit = await prisma.rule.findFirst({ where: { projectId: p.id, slug: r.key } });
    const data: any = { name: r.name || r.key, description: r.description ?? null, type: r.type, topicId: r.topic ? topicId.get(r.topic) || null : null, library: !!r.library, libraryRef: r.libraryRef ?? undefined,
      definition: r.definition ?? {}, inputSchema: r.inputSchema ?? undefined, outputSchema: r.outputSchema ?? undefined, tags: r.tags || [] };
    let rule;
    if (hit) rule = await prisma.rule.update({ where: { id: hit.id }, data: { ...data, version: hit.version + 1, status: 'DRAFT' } });
    else rule = await prisma.rule.create({ data: { ...data, projectId: p.id, slug: r.key, createdById: user.userId } });
    if (opts.publish) {
      await prisma.ruleVersion.create({ data: { ruleId: rule.id, version: rule.version, definition: rule.definition as any, inputSchema: rule.inputSchema as any, outputSchema: rule.outputSchema as any, status: 'PUBLISHED', message: opts.message || 'Imported', createdById: user.userId } }).catch(() => {});
      await prisma.rule.update({ where: { id: rule.id }, data: { status: 'PUBLISHED' } });
    }
    done.push(`rules:${r.key}`);
  }
  for (const f of P.flows || []) if (go('flows', f.key)) {
    const hit = await prisma.flow.findFirst({ where: { projectId: p.id, slug: f.key } });
    const data: any = { name: f.name || f.key, kind: f.kind || 'DECISION', description: f.description ?? null, topicId: f.topic ? topicId.get(f.topic) || null : null, graph: f.graph ?? {}, inputSchema: f.inputSchema ?? undefined, outputSchema: f.outputSchema ?? undefined, schedule: f.schedule ?? undefined };
    let flow = hit ? await prisma.flow.update({ where: { id: hit.id }, data: { ...data, status: 'DRAFT' } }) : await prisma.flow.create({ data: { ...data, projectId: p.id, slug: f.key } });
    if (opts.publish) {
      const v = flow.version + 1;
      await prisma.flowVersion.create({ data: { flowId: flow.id, version: v, graph: flow.graph as any, inputSchema: flow.inputSchema as any, outputSchema: flow.outputSchema as any, status: 'PUBLISHED', message: opts.message || 'Imported' } });
      flow = await prisma.flow.update({ where: { id: flow.id }, data: { status: 'PUBLISHED', version: v } });
    }
    done.push(`flows:${f.key}`);
  }
  const flowId = new Map((await prisma.flow.findMany({ where: { projectId: p.id } })).map(f => [f.slug, f.id]));
  for (const s of P.apis || []) if (go('apis', s.key)) {
    let spec = await prisma.apiSpec.findFirst({ where: { projectId: p.id, slug: s.key } });
    const data = { name: s.name || s.key, basePath: s.basePath, version: s.version || 1, description: s.description ?? null };
    spec = spec ? await prisma.apiSpec.update({ where: { id: spec.id }, data: { ...data, revision: spec.revision + 1 } }) : await prisma.apiSpec.create({ data: { ...data, projectId: p.id, workspaceId: p.workspaceId, slug: s.key } });
    for (const o of s.operations || []) {
      const fid = o.flow ? flowId.get(o.flow) : undefined; if (!fid) continue;
      const opData = { summary: o.summary ?? null, requestSchema: o.requestSchema ?? undefined, responseSchema: o.responseSchema ?? undefined };
      const op = await prisma.apiOperation.findFirst({ where: { specId: spec.id, method: o.method, path: o.path } });
      if (op) await prisma.apiOperation.update({ where: { id: op.id }, data: { ...opData, flowId: fid } }).catch(() => {});
      else await prisma.apiOperation.create({ data: { ...opData, specId: spec.id, method: o.method, path: o.path, flowId: fid } }).catch(() => {});
    }
    if (opts.publish) await prisma.apiSpec.update({ where: { id: spec.id }, data: { status: 'PUBLISHED' } });
    done.push(`apis:${s.key}`);
  }
  const ruleId = new Map((await prisma.rule.findMany({ where: { projectId: p.id } })).map(r => [r.slug, r.id]));
  for (const c of P.testCases || []) if (go('testCases', c.key)) {
    const target = c.targetType === 'topic' ? topicId.get(c.target) : c.targetType === 'rule' ? ruleId.get(c.target) : c.targetType === 'decision_flow' ? flowId.get(c.target) : c.target;
    if (!target) continue;
    const hit = await prisma.testCase.findFirst({ where: { projectId: p.id, deletedAt: null, targetType: c.targetType, targetId: target, name: c.name } });
    const data = { input: c.input ?? {}, expectations: c.expectations ?? [] };
    if (hit) await prisma.testCase.update({ where: { id: hit.id }, data }); else await prisma.testCase.create({ data: { ...data, projectId: p.id, name: c.name, targetType: c.targetType, targetId: target, ruleId: c.targetType === 'rule' ? target : null } });
    done.push(`testCases:${c.key}`);
  }
  if (opts.publish) { const { invalidateArtifacts } = await import('./runner.js'); invalidateArtifacts(); }
  const { audit } = await import('../services/governance.service.js');
  await audit(p.id, user, 'bundle.import', 'project', p.id, { source: bundle.source, exportedAt: bundle.exportedAt, applied: done.length, skipped: Array.from(skip) });
  return { applied: done, skipped: Array.from(skip), notImported: preview.rows.filter(r => r.change === 'not imported') };
}

// ---------------------------------------------------------------------------------------------- releases
/** The full snapshot a new release keeps (immutable: a release is never edited, only revoked). */
export async function snapshotFor(projectId: string, name: string): Promise<Bundle> {
  const p = await prisma.project.findUnique({ where: { id: projectId } });
  const { parts } = await build(projectId);
  return { format: 'xrules-bundle', version: 1, exportedAt: new Date().toISOString(), source: { projectId, project: p?.name || '', environment: currentEnvironment(), release: name }, parts };
}

export async function compareReleases(aId: string, bId: string, user: AuthUser) {
  const [a, b] = await Promise.all([prisma.release.findUnique({ where: { id: aId } }), prisma.release.findUnique({ where: { id: bId } })]);
  if (!a || !b) throw new NotFoundError('Release');
  await assertProjectAccess(a.projectId, user);
  if (a.projectId !== b.projectId) throw new ValidationError('Compare two releases of the same project');
  const pa = (a.manifest as any)?.bundle?.parts, pb = (b.manifest as any)?.bundle?.parts;
  if (pa && pb) return { from: { id: a.id, name: a.name }, to: { id: b.id, name: b.name }, full: true, changes: diff(pa, pb) };
  // older releases list versions only: compare those
  const asParts = (m: any) => ({ rules: (m?.rules || []).map((r: any) => ({ key: r.slug, v: r.version })), flows: (m?.flows || []).map((f: any) => ({ key: f.slug, v: f.version })) });
  return { from: { id: a.id, name: a.name }, to: { id: b.id, name: b.name }, full: false, changes: diff(asParts(a.manifest) as any, asParts(b.manifest) as any) };
}

/** Ask to roll back: an approver must agree; approving restores the old release and makes a new release equal to it. */
export async function requestRollback(releaseId: string, note: string | undefined, user: AuthUser) {
  const rel = await prisma.release.findUnique({ where: { id: releaseId } }); if (!rel) throw new NotFoundError('Release');
  await assertProjectAccess(rel.projectId, user, 'write');
  if (!(rel.manifest as any)?.bundle) throw new ValidationError(`Release ${rel.name} lists versions only, so it cannot be restored`);
  await prisma.reviewRequest.updateMany({ where: { targetType: 'rollback', projectId: rel.projectId, status: 'PENDING' }, data: { status: 'WITHDRAWN', decidedAt: new Date() } });
  const r = await prisma.reviewRequest.create({ data: { projectId: rel.projectId, targetType: 'rollback', targetId: rel.id, title: `Roll back to ${rel.name}`, submittedBy: user.email || user.userId, note, snapshot: { releaseId: rel.id, release: rel.name, environment: currentEnvironment() } } });
  const { audit } = await import('../services/governance.service.js');
  await audit(rel.projectId, user, 'rollback.request', 'release', rel.id);
  return r;
}

export async function performRollback(releaseId: string, user: AuthUser) {
  const rel = await prisma.release.findUnique({ where: { id: releaseId } }); if (!rel) throw new NotFoundError('Release');
  const bundle = (rel.manifest as any).bundle as Bundle;
  const res = await applyBundle(rel.projectId, bundle, user, { publish: true, message: `Rollback to ${rel.name}` });
  const name = `${rel.name} (rollback ${new Date().toISOString().slice(0, 16).replace('T', ' ')})`;
  const { create } = await import('../services/releases.service.js');
  const created = await create({ projectId: rel.projectId, name, description: `Rollback to ${rel.name}`, rolledBackFrom: rel.id } as any, user, { skipAccess: true });
  const env = await prisma.environment.findFirst({ where: { projectId: rel.projectId, slug: { equals: currentEnvironment(), mode: 'insensitive' } } });
  if (env) await prisma.environment.update({ where: { id: env.id }, data: { releaseId: created.id } });
  return { release: created, applied: res.applied.length };
}

// ---------------------------------------------------------------------------------------------- live parameters
const tuner = async (projectId: string, user: AuthUser) => {
  const p = await assertProjectAccess(projectId, user);
  const m = await prisma.workspaceMember.findFirst({ where: { workspaceId: p.workspaceId, userId: user.userId } });
  if (!m || !(m.role === 'OWNER' || m.role === 'ADMIN' || (m as any).canTune)) throw new ForbiddenError('You cannot tune live parameters in this organization');
  return p;
};

export async function liveParams(projectId: string, user: AuthUser) {
  const p = await assertProjectAccess(projectId, user);
  const { list } = await import('./product-settings.js');
  const sheet = await list(p.id, user);
  const requests = await prisma.reviewRequest.findMany({ where: { projectId: p.id, targetType: 'param_change' }, orderBy: { createdAt: 'desc' }, take: 100 });
  const audit = await prisma.auditLog.findMany({ where: { workspaceId: p.workspaceId, resource: 'live_param', resourceId: p.id }, orderBy: { createdAt: 'desc' }, take: 100, include: { user: { select: { email: true, name: true } } } });
  return { environment: currentEnvironment(), products: sheet.products, rows: sheet.rows, requests, audit: audit.map(a => ({ at: a.createdAt, action: a.action, by: a.user?.email || a.user?.name || null, details: a.details ?? null })) };
}

export async function markTunable(data: { projectId: string; ids: string[]; tunable: boolean }, user: AuthUser) {
  const p = await assertProjectAccess(data.projectId, user, 'admin');
  await prisma.productSetting.updateMany({ where: { projectId: p.id, id: { in: data.ids || [] } }, data: { tunable: !!data.tunable } as any });
  return liveParams(p.id, user);
}

type Change = { settingId: string; product: string; to: any };
async function resolveChanges(projectId: string, changes: Change[]) {
  if (!Array.isArray(changes) || !changes.length) throw new ValidationError('Change at least one value');
  const rows = await prisma.productSetting.findMany({ where: { projectId, deletedAt: null } });
  return changes.map(c => {
    const r = rows.find(x => x.id === c.settingId); if (!r) throw new NotFoundError('Setting');
    if (!(r as any).tunable) throw new ForbiddenError(`${r.name} is not a live parameter`);
    const s = String(c.to ?? '').trim(); const n = Number(s.replace(/,/g, '')); if (!s) throw new ValidationError(`${r.name}: give a value`);
    return { settingId: r.id, name: r.name, product: c.product, from: (r.values as any)?.[c.product] ?? null, to: isNaN(n) ? s : n };
  });
}

/** Topic tests now and with the proposed values: which cases change result. */
export async function impact(data: { projectId: string; changes: Change[] }, user: AuthUser) {
  const p = await assertProjectAccess(data.projectId, user);
  const changes = await resolveChanges(p.id, data.changes);
  const over: Record<string, Record<string, any>> = {};
  for (const c of changes) (over[c.name.toLowerCase()] ||= {})[c.product] = c.to;
  const { dryRunTopic } = await import('./testing.js');
  const { settingOverrides } = await import('./product-settings.js');
  const products = Array.from(new Set(changes.map(c => c.product)));
  const topics = await prisma.topic.findMany({ where: { projectId: p.id, deletedAt: null, OR: [{ product: { in: products } }, { product: null }] } });
  const out = [];
  for (const t of topics) {
    const before = await dryRunTopic(t.id, {});
    if (!before.length) continue;
    const after = await settingOverrides.run(over, () => dryRunTopic(t.id, {}));
    const cases = before.map((b, i) => ({ name: b.name, before: b.pass, after: after[i]?.pass, resultBefore: b.result, resultAfter: after[i]?.result, changed: JSON.stringify(b.result) !== JSON.stringify(after[i]?.result) || b.pass !== after[i]?.pass }));
    out.push({ topic: t.name, product: t.product, total: cases.length, passedBefore: cases.filter(c => c.before).length, passedAfter: cases.filter(c => c.after).length, changed: cases.filter(c => c.changed) });
  }
  return { changes, topics: out, regressions: out.reduce((n, t) => n + t.changed.filter(c => c.before && !c.after).length, 0) };
}

export async function requestChange(data: { projectId: string; changes: Change[]; effectiveAt?: string; note?: string }, user: AuthUser) {
  const p = await tuner(data.projectId, user);
  const changes = await resolveChanges(p.id, data.changes);
  const at = data.effectiveAt ? new Date(data.effectiveAt) : new Date();
  if (isNaN(at.getTime())) throw new ValidationError('Effective date is not a date');
  const evidence = await impact({ projectId: p.id, changes: data.changes }, user).catch(e => ({ error: String(e?.message || e) }));
  const title = changes.map(c => `${c.name} · ${c.product}: ${c.from ?? '—'} → ${c.to}`).join('; ').slice(0, 300);
  const r = await prisma.reviewRequest.create({ data: { projectId: p.id, targetType: 'param_change', targetId: p.id, title, submittedBy: user.email || user.userId, note: data.note, evidence: evidence as any, snapshot: { changes, effectiveAt: at.toISOString(), applied: false } as any } });
  await logParam(p.id, user, 'live_param.request', { request: r.id, changes, effectiveAt: at.toISOString() });
  return r;
}

// the audit trail of live parameters (audit_logs: resource live_param, resourceId = project)
async function logParam(projectId: string, user: AuthUser | { email?: string | null }, action: string, meta: any) {
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } }); if (!p) return;
  let userId = (user as any).userId as string | undefined;
  if (!userId || userId === '__system__') userId = (await prisma.user.findFirst({ where: { email: String((user as any).email || '') } }))?.id;
  if (!userId) return;
  await prisma.auditLog.create({ data: { workspaceId: p.workspaceId, userId, action, resource: 'live_param', resourceId: projectId, details: meta } }).catch(() => {});
}

/** Put approved changes live once their effective time has come. Called on approval and every minute. */
export async function applyDueChanges(onlyId?: string) {
  const due = await prisma.reviewRequest.findMany({ where: { targetType: 'param_change', status: 'APPROVED', ...(onlyId ? { id: onlyId } : {}) } });
  let n = 0;
  for (const r of due) {
    const s: any = r.snapshot || {}; if (s.applied || new Date(s.effectiveAt) > new Date()) continue;
    for (const c of s.changes || []) {
      const row = await prisma.productSetting.findUnique({ where: { id: c.settingId } }); if (!row) continue;
      await prisma.productSetting.update({ where: { id: row.id }, data: { values: { ...((row.values as any) || {}), [c.product]: c.to } } });
    }
    await prisma.reviewRequest.update({ where: { id: r.id }, data: { snapshot: { ...s, applied: true, appliedAt: new Date().toISOString() } } });
    await logParam(r.projectId, { email: r.reviewedBy }, 'live_param.apply', { request: r.id, changes: s.changes, approvedBy: r.reviewedBy, requestedBy: r.submittedBy });
    const { invalidateArtifacts } = await import('./runner.js'); invalidateArtifacts();
    n++;
  }
  return n;
}
let timer: NodeJS.Timeout | null = null;
export function startLiveParamScheduler() { if (timer) return; timer = setInterval(() => { applyDueChanges().catch(() => {}); }, 60_000); timer.unref?.(); }

// ---------------------------------------------------------------------------------------------- CI
/** Check a bundle without writing: shape, references between objects, and what it would change. */
export async function validate(projectId: string | undefined, bundle: Bundle, user: AuthUser) {
  const problems: string[] = [];
  const P = bundle.parts;
  const topics = new Set((P.topics || []).map(t => t.key)); const flows = new Set((P.flows || []).map(f => f.key));
  const sets = new Set((P.valueSets || []).map(v => v.key));
  for (const r of P.rules || []) { if (!r.type) problems.push(`rules/${r.key}: no type`); if (r.topic && P.topics && !topics.has(r.topic)) problems.push(`rules/${r.key}: topic "${r.topic}" is not in the bundle`); }
  for (const w of P.words || []) if (w.valueSet && P.valueSets && !sets.has(w.valueSet)) problems.push(`words/${w.key}: value set "${w.valueSet}" is not in the bundle`);
  for (const s of P.apis || []) { if (!s.basePath) problems.push(`apis/${s.key}: no base path`); for (const o of s.operations || []) if (o.flow && P.flows && !flows.has(o.flow)) problems.push(`apis/${s.key}: ${o.method} ${o.path} uses flow "${o.flow}" that is not in the bundle`); }
  for (const c of P.testCases || []) if (!Array.isArray(c.expectations) || !c.expectations.length) problems.push(`testCases/${c.key}: no expectations`);
  const preview = projectId ? await previewImport(projectId, bundle, user) : null;
  return { ok: !problems.length, problems, preview: preview ? preview.summary : null };
}

/** Run every test case of a project; fails when a case fails, or (failOn: regressions) only when a case that passed before fails now. */
export async function runSuites(projectId: string, user: AuthUser, failOn: 'any' | 'regressions' = 'any') {
  const p = await assertProjectAccess(projectId, user);
  const { runCase } = await import('./testing.js');
  const cases = await prisma.testCase.findMany({ where: { projectId: p.id, deletedAt: null } });
  const results = [];
  for (const c of cases) { const before = c.lastStatus; const r = await runCase(c.id).catch((e: any) => ({ id: c.id, name: c.name, pass: false, error: String(e?.message || e) } as any)); results.push({ id: c.id, name: c.name, targetType: c.targetType, pass: r.pass, before, regression: before === 'PASS' && !r.pass }); }
  const failed = results.filter(r => !r.pass); const regressions = results.filter(r => r.regression);
  return { total: results.length, passed: results.length - failed.length, failed: failed.length, regressions: regressions.length, ok: failOn === 'regressions' ? !regressions.length : !failed.length, results: results.filter(r => !r.pass) };
}

const ORDER = ['QA', 'UAT', 'PROD'];
/**
 * Promote a release to the next environment of this installation's chain. In this environment: tests must pass and
 * the release is pinned to the environment named `to`. The target installation imports the same bundle
 * (POST /platform/ops/import with publish), so each environment keeps its own database.
 */
export async function promote(data: { releaseId: string; to: string }, user: AuthUser) {
  const rel = await prisma.release.findUnique({ where: { id: data.releaseId } }); if (!rel) throw new NotFoundError('Release');
  await assertProjectAccess(rel.projectId, user, 'admin');
  const to = String(data.to || '').toUpperCase(); if (!ORDER.includes(to)) throw new ValidationError(`Promote to ${ORDER.join(', ')}`);
  const envs = await prisma.environment.findMany({ where: { projectId: rel.projectId } });
  const prev = ORDER[ORDER.indexOf(to) - 1];
  if (prev) { const pe = envs.find(e => e.slug.toUpperCase() === prev); if (pe && pe.releaseId !== rel.id) throw new ValidationError(`${rel.name} is not live in ${prev} yet: promote it there first`); }
  const tests = await runSuites(rel.projectId, user, 'regressions');
  if (!tests.ok) throw new ValidationError(`Tests regressed: ${tests.regressions} case${tests.regressions === 1 ? '' : 's'} that passed before fail now`);
  let env = envs.find(e => e.slug.toUpperCase() === to);
  if (!env) env = await prisma.environment.create({ data: { projectId: rel.projectId, name: to, slug: to.toLowerCase() } });
  await prisma.environment.update({ where: { id: env.id }, data: { releaseId: rel.id } });
  const { audit } = await import('../services/governance.service.js');
  await audit(rel.projectId, user, 'release.promote', 'release', rel.id, { to });
  return { release: rel.name, environment: to, tests: { total: tests.total, passed: tests.passed } };
}
