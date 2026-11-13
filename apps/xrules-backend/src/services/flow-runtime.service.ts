// Synchronous in-process flow runner used by RULE_FLOW rules.
//
// Walks the graph topologically from the input node and accumulates a
// "context" map across nodes. Supported node kinds:
//
//   - input          — seed the context with the rule input
//   - output         — terminate and return whatever's in the context
//                      (or, if data.pick is set, just that key)
//   - ruleCall       — DR.solve(data.ruleSlug, mappedInput) → context[data.outputAs]
//   - assign         — set context[data.target] = eval(data.expression, context)
//   - transform      — like assign but writes into a sub-object via data.target path
//   - branch         — eval data.condition; pick "true" / "false" branch edge
//
// Anything else is a no-op (visited but doesn't change context). This lets us
// render fancy node palettes in the UI without breaking execution.

import { evalExpression } from './sandbox.service.js';
import * as datasets from '../data/datasets-runtime.js';
import { checkFile, type Finding, type TemplateSpec } from '../data/files.js';
import { prisma } from '../config/database.js';

// Decision-flow data nodes (Data Layer):
//   enrich    { dataset, forEach?: "input.items", key: ["{{item.itemCode}}","{{input.context.fiscalYear}}"],
//               writeTo: "ref.standardPrice" (relative to item, or ctx path when no forEach),
//               timeoutMs?: 500, ruleCodes?: ["TOR-4.4.1.3"] }   — on failure the listed rules are SKIPPED
//   filecheck { files: "input.files", ruleCode?: "TOR-4.4.1.7" }   — each file names its templateCode
//   findings  { }                                                  — output: { passed, summary, findings, lineage }
// A ruleCall with data.ruleCode collects findings from the rule's output:
//   output.findings[]  or  output.pass === false / output.valid === false (+ message, severity, lineId, field)
export interface FlowOptions {
  projectId?: string;
  /** run another (published) flow by slug — used by the callDecisionFlow step */
  callFlow?: (slug: string, input: any) => Promise<any>;
  /** collect a step-by-step trace (Rule Trace) */
  trace?: TraceStep[];
}

// ---------------------------------------------------------------- Rule Trace
export interface TraceStep {
  seq: number; nodeId: string; kind: string; label?: string;
  status: 'ok' | 'skipped' | 'error'; ms: number;
  input?: any; output?: any; note?: string; children?: TraceStep[];
}
const MAX_TRACE_VALUE = 4000;
function clip(v: any): any {
  if (v === undefined) return undefined;
  try { const s = JSON.stringify(v); return s.length > MAX_TRACE_VALUE ? { __truncated: true, preview: s.slice(0, MAX_TRACE_VALUE) } : v; } catch { return String(v); }
}
function pushTrace(opts: FlowOptions, node: any, kind: string, t0: number, status: TraceStep['status'], extra: Partial<TraceStep> = {}) {
  if (!opts.trace) return;
  opts.trace.push({ seq: opts.trace.length + 1, nodeId: node.id, kind, label: node.data?.label, status, ms: Date.now() - t0, ...extra,
    input: clip(extra.input), output: clip(extra.output) });
}

/** Marker returned by the apiResponse step */
export interface ApiResponse { __apiResponse: true; status: number; body: any; headers?: Record<string, string> }

interface DataCtx { findings: Finding[]; lineage: Record<string, string>; stale: string[]; skipRules: Set<string> }
function dataCtx(ctx: any): DataCtx {
  if (!ctx.__data) Object.defineProperty(ctx, '__data', { value: { findings: [], lineage: {}, stale: [], skipRules: new Set() }, enumerable: false, writable: true });
  return ctx.__data;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: NodeJS.Timeout;
  return Promise.race([p, new Promise<T>((_, rej) => { t = setTimeout(() => rej(new Error(`timeout after ${ms} ms`)), ms); })]).finally(() => clearTimeout(t));
}

async function runEnrich(data: any, ctx: any, opts: FlowOptions) {
  const dc = dataCtx(ctx);
  if (!opts.projectId) throw new Error('enrich needs a project');
  const items: any[] = data.forEach ? (readPath(ctx, String(data.forEach)) || []) : [null];
  const timeoutMs = Number(data.timeoutMs || 500);
  try {
    await withTimeout(Promise.all(items.map(async (item) => {
      const scope = item === null ? ctx : { ...ctx, item };
      const key = (data.key || []).map((k: string) => { const v = renderTemplate(k, scope); return v == null ? '' : String(v).trim(); }).join('|');
      const r = await datasets.lookup(opts.projectId!, String(data.dataset), key);
      dc.lineage[String(data.dataset)] = r.snapshotAt || '';
      if (r.stale && !dc.stale.includes(String(data.dataset))) dc.stale.push(String(data.dataset));
      const val = r.found ? r.data : null;
      if (item === null) setPath(ctx, String(data.writeTo || data.dataset), val);
      else setPath(item, String(data.writeTo || data.dataset), val);
    })), timeoutMs);
  } catch (e: any) {
    for (const rc of data.ruleCodes || []) {
      dc.skipRules.add(rc);
      dc.findings.push({ ruleCode: rc, severity: 'SKIPPED', message: `ยังไม่ได้ตรวจ: ดึงข้อมูล ${data.dataset} ไม่ได้ (${e.message})` });
    }
  }
}

async function runFileCheck(data: any, ctx: any, opts: FlowOptions) {
  const dc = dataCtx(ctx);
  const files: any[] = readPath(ctx, String(data.files || 'input.files')) || [];
  const ruleCode = data.ruleCode || 'TOR-4.4.1.7';
  for (const f of files) {
    if (!f?.templateCode) continue;
    const tpl = opts.projectId ? await prisma.fileTemplate.findUnique({ where: { projectId_code: { projectId: opts.projectId, code: String(f.templateCode) } } }) : null;
    if (!tpl) { dc.findings.push({ ruleCode, severity: 'SKIPPED', fileId: f.fileId, message: `ไม่พบแบบฟอร์ม ${f.templateCode} จึงยังไม่ได้ตรวจไฟล์` }); continue; }
    dc.lineage[`template:${tpl.code}`] = `v${tpl.version}`;
    dc.findings.push(...await checkFile(f, tpl.code, tpl.spec as unknown as TemplateSpec, ruleCode));
  }
}

function collectRuleFindings(data: any, out: any, ctx: any) {
  if (!data.ruleCode) return;
  const dc = dataCtx(ctx);
  const sev = (data.severity || 'ERROR').toUpperCase();
  const list: any[] = Array.isArray(out?.findings) ? out.findings
    : Array.isArray(out) ? out.filter((o: any) => o && (o.pass === false || o.valid === false))
    : (out && (out.pass === false || out.valid === false)) ? [out] : [];
  for (const f of list) dc.findings.push({ ruleCode: f.ruleCode || data.ruleCode, severity: (f.severity || sev).toUpperCase(), message: f.message || `ไม่ผ่านกฎ ${data.ruleCode}`, lineId: f.lineId, field: f.field, fileId: f.fileId, ref: f.ref });
}

function findingsOutput(ctx: any) {
  const dc = dataCtx(ctx);
  const order: Record<string, number> = { ERROR: 0, WARNING: 1, SKIPPED: 2, INFO: 3 };
  const findings = [...dc.findings].sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
  const summary = { error: 0, warning: 0, skipped: 0 } as Record<string, number>;
  for (const f of findings) { const k = f.severity.toLowerCase(); summary[k] = (summary[k] || 0) + 1; }
  return { passed: summary.error === 0, summary, findings, lineage: { datasets: dc.lineage, stale: dc.stale } };
}

// For a rule call: if an enrich step failed for this rule, skip it.
function shouldSkip(data: any, ctx: any) { return !!data.ruleCode && dataCtx(ctx).skipRules.has(data.ruleCode); }

interface FlowGraph {
  nodes: Array<{ id: string; type?: string; data?: any }>;
  edges: Array<{ id?: string; source: string; target: string; sourceHandle?: string; label?: string }>;
}

type SolveFn = (slugOrId: string, input: any) => Promise<any>;

const TEMPLATE_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

// "{{input.amount}}" / "{{customer.tier}}" → value from context
function renderTemplate(tpl: any, ctx: Record<string, any>): any {
  if (typeof tpl !== 'string') return tpl;
  // If the entire string is one expression, return the typed value (number, object, …)
  const m = tpl.match(/^\{\{\s*([^{}]+?)\s*\}\}$/);
  if (m) return readPath(ctx, m[1].trim());
  // Otherwise interpolate into a string
  return tpl.replace(TEMPLATE_RE, (_, path) => {
    const v = readPath(ctx, path.trim());
    return v === undefined || v === null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  });
}

function readPath(obj: any, path: string): any {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function renderObject(o: any, ctx: Record<string, any>): any {
  if (o === null || o === undefined) return o;
  if (typeof o === 'string') return renderTemplate(o, ctx);
  if (Array.isArray(o)) return o.map(x => renderObject(x, ctx));
  if (typeof o === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(o)) out[k] = renderObject(v, ctx);
    return out;
  }
  return o;
}

export async function runFlow(graph: FlowGraph, input: any, solve: SolveFn, opts: FlowOptions = {}): Promise<any> {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new Error('Flow has no graph');
  }
  const nodeById = new Map<string, any>();
  for (const n of graph.nodes) nodeById.set(n.id, n);

  const childrenOf = new Map<string, Array<{ target: string; sourceHandle?: string }>>();
  for (const e of graph.edges) {
    const arr = childrenOf.get(e.source) || [];
    arr.push({ target: e.target, sourceHandle: e.sourceHandle });
    childrenOf.set(e.source, arr);
  }

  const start = graph.nodes.find(n => ['input', 'apiinput', 'trigger'].includes(String(n.type || n.data?.kind || '').toLowerCase()));
  if (!start) throw new Error('Flow has no input node');

  const ctx: Record<string, any> = { input };
  let cur: any = start;
  const visited = new Set<string>();
  const MAX_STEPS = 200;

  for (let step = 0; step < MAX_STEPS; step++) {
    if (!cur) break;
    if (visited.has(cur.id)) {
      throw new Error(`Flow has a cycle at node '${cur.id}'`);
    }
    visited.add(cur.id);

    const kind = String(cur.type || cur.data?.kind || '').toLowerCase();
    const data = cur.data || {};

    let pickedHandle: string | undefined;
    const t0 = Date.now();
    let stepOut: any = undefined; let stepStatus: TraceStep['status'] = 'ok'; let stepNote: string | undefined;

    try {
    switch (kind) {
      case 'input':
        // Already seeded ctx.input; nothing to do.
        break;

      case 'findings': {
        const out = findingsOutput(ctx);
        pushTrace(opts, cur, kind, t0, 'ok', { output: out.summary });
        return out;
      }

      case 'trigger':
      case 'apiinput':
        stepOut = { params: ctx.input?.params, query: ctx.input?.query };
        break;

      case 'apiresponse': {
        const body = data.body !== undefined ? renderObject(data.body, ctx) : (ctx.__data ? findingsOutput(ctx) : (() => { const { input: _i, ...rest } = ctx; return rest; })());
        const resp: ApiResponse = { __apiResponse: true, status: Number(data.status || 200), body, headers: data.headers };
        pushTrace(opts, cur, kind, t0, 'ok', { output: { status: resp.status } });
        return resp;
      }

      case 'calldecisionflow': {
        if (!opts.callFlow) throw new Error('callDecisionFlow is not available here');
        const slug = data.flow || data.flowSlug;
        if (!slug) throw new Error(`callDecisionFlow node '${cur.id}' needs data.flow`);
        const mapped = data.inputMap ? renderObject(data.inputMap, ctx) : ctx.input?.body ?? ctx.input;
        const sub: TraceStep[] = [];
        const out = await opts.callFlow(String(slug), mapped);
        ctx[data.outputAs || 'decision'] = out;
        stepOut = { passed: out?.passed, summary: out?.summary };
        if (sub.length) stepNote = `${sub.length} steps`;
        break;
      }

      case 'lookup': {
        // single key lookup into a Data Set: { dataset, key: [...templates], outputAs }
        if (!opts.projectId) throw new Error('lookup needs a project');
        const key = (data.key || []).map((k: string) => { const v = renderTemplate(k, ctx); return v == null ? '' : String(v).trim(); }).join('|');
        const r = await datasets.lookup(opts.projectId, String(data.dataset), key);
        dataCtx(ctx).lineage[String(data.dataset)] = r.snapshotAt || '';
        ctx[data.outputAs || 'found'] = r.found ? r.data : null;
        stepOut = { key, found: r.found };
        break;
      }

      case 'enrich':
        await runEnrich(data, ctx, opts);
        break;

      case 'filecheck':
        await runFileCheck(data, ctx, opts);
        break;

      case 'output': {
        pushTrace(opts, cur, kind, t0, 'ok');
        if (ctx.__data && !data.pick && !data.return) return findingsOutput(ctx);
        if (data.pick) return readPath(ctx, String(data.pick));
        // If output node has explicit return shape, render it
        if (data.return) return renderObject(data.return, ctx);
        // Default: drop the original input, return everything else
        const { input: _drop, ...rest } = ctx;
        return rest;
      }

      case 'rulecall': {
        const slug = data.ruleSlug || data.rule || data.slug;
        if (!slug) throw new Error(`ruleCall node '${cur.id}' missing data.ruleSlug`);
        if (shouldSkip(data, ctx)) { stepStatus = 'skipped'; stepNote = 'ข้อมูลอ้างอิงไม่พร้อม'; break; }
        const mappedInput = data.inputMap ? renderObject(data.inputMap, ctx) : ctx.input;
        const out = await solve(String(slug), mappedInput);
        const key = data.outputAs || slug.toString().replace(/-/g, '_');
        ctx[key] = out;
        collectRuleFindings(data, out, ctx);
        stepOut = out;
        break;
      }

      case 'assign':
      case 'transform': {
        if (!data.target || !data.expression) break;
        const val = evalExpression(String(data.expression), { ...ctx, Math, Date, JSON });
        // Allow dotted target ("subtotal" or "result.score")
        setPath(ctx, String(data.target), val);
        break;
      }

      case 'branch': {
        const cond = data.condition ? !!evalExpression(String(data.condition), { ...ctx, Math, Date, JSON }) : false;
        pickedHandle = cond ? 'true' : 'false';
        break;
      }

      // Fan-out — children run in parallel, all sharing the same ctx snapshot.
      // Each branch is itself a sub-flow that walks until it hits a `merge`
      // node (or runs out of children). Results are merged back in the order
      // declared in data.merge — or "object" by default (each branch's
      // outputAs key becomes a property on ctx[data.outputAs || 'parallel']).
      case 'parallel':
      case 'fanout': {
        const children = childrenOf.get(cur.id) || [];
        if (children.length === 0) break;
        // Snapshot the current ctx so each branch starts from the same view
        const snapshot = { ...ctx };
        const results = await Promise.all(children.map(async (c) => {
          const branchCtx = await runBranch(nodeById, childrenOf, c.target, snapshot, solve, opts, ctx);
          return { handle: c.sourceHandle || c.target, ctx: branchCtx };
        }));
        // Merge — write each branch's contribution under outputAs (or branch handle)
        const mergeKey = data.outputAs || 'parallel';
        const merged: any = data.shape === 'array' ? [] : {};
        for (const r of results) {
          // strip the snapshot keys so we only keep what the branch added
          const added: any = {};
          for (const [k, v] of Object.entries(r.ctx)) {
            if (snapshot[k] !== v) added[k] = v;
          }
          if (data.shape === 'array') merged.push(added);
          else merged[r.handle] = Object.keys(added).length === 1 ? Object.values(added)[0] : added;
        }
        ctx[mergeKey] = merged;
        // Find the post-fanout continuation: a `merge` node downstream with
        // no other parents from outside the fanout. Walk past any merge node.
        const mergeNode = findMergeAfter(nodeById, childrenOf, cur.id);
        cur = mergeNode ? mergeNode : null;
        pushTrace(opts, cur, kind, t0, 'ok', { output: Object.keys(merged) });
        continue; // skip normal child-pick below since we set cur ourselves
      }

      case 'merge':
        // No-op — consumed by the fanout traversal above. If the user
        // routes here directly (no parallel), just continue.
        break;

      default:
        // Ignore unknown kinds (sticky, declare, etc).
        break;
    }

    } catch (err: any) {
      pushTrace(opts, cur, kind, t0, 'error', { note: err?.message });
      throw err;
    }
    if (kind === 'enrich' || kind === 'filecheck') stepOut = { findings: dataCtx(ctx).findings.length };
    pushTrace(opts, cur, kind, t0, stepStatus, { output: stepOut, note: stepNote });

    // Pick next node
    const childs = childrenOf.get(cur.id) || [];
    let next: any = null;
    if (pickedHandle) {
      const match = childs.find(c => c.sourceHandle === pickedHandle);
      next = match && nodeById.get(match.target);
      if (!next && childs[0]) next = nodeById.get(childs[0].target); // fallback to first
    } else {
      next = childs[0] && nodeById.get(childs[0].target);
    }
    cur = next;
  }

  // Reached the step cap with no output
  const { input: _drop, ...rest } = ctx;
  return rest;
}

function setPath(obj: any, path: string, val: any) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (typeof cur[k] !== 'object' || cur[k] == null) cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = val;
}

// Walk a single branch of a fan-out until we hit a `merge` node or run out
// of nodes. Returns the branch's local context (caller will diff against
// snapshot to extract just what this branch produced).
async function runBranch(
  nodeById: Map<string, any>,
  childrenOf: Map<string, Array<{ target: string; sourceHandle?: string }>>,
  startId: string,
  snapshot: Record<string, any>,
  solve: SolveFn,
  opts: FlowOptions = {},
  parent?: Record<string, any>,
): Promise<Record<string, any>> {
  const ctx: Record<string, any> = { ...snapshot };
  // branches share the parent's findings/lineage collector
  if (parent) Object.defineProperty(ctx, '__data', { value: dataCtx(parent), enumerable: false, writable: true });
  let cur = nodeById.get(startId);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    const kind = String(cur.type || cur.data?.kind || '').toLowerCase();
    if (kind === 'merge' || kind === 'output') break;
    const data = cur.data || {};
    const t0 = Date.now();

    if (kind === 'rulecall') {
      const slug = data.ruleSlug || data.rule || data.slug;
      if (slug && !shouldSkip(data, ctx)) {
        const mappedInput = data.inputMap ? renderObject(data.inputMap, ctx) : ctx.input;
        const out = await solve(String(slug), mappedInput);
        const key = data.outputAs || String(slug).replace(/-/g, '_');
        ctx[key] = out;
        collectRuleFindings(data, out, ctx);
      }
    } else if (kind === 'enrich') {
      await runEnrich(data, ctx, opts);
    } else if (kind === 'filecheck') {
      await runFileCheck(data, ctx, opts);
    } else if (kind === 'assign' || kind === 'transform') {
      if (data.target && data.expression) {
        const val = evalExpression(String(data.expression), { ...ctx, Math, Date, JSON });
        setPath(ctx, String(data.target), val);
      }
    }
    pushTrace(opts, cur, kind, t0, kind === 'rulecall' && shouldSkip(data, ctx) ? 'skipped' : 'ok', { output: data.outputAs ? ctx[data.outputAs] : undefined });
    // (branch within branch is not supported — keep it simple)

    const childs = childrenOf.get(cur.id) || [];
    cur = childs[0] ? nodeById.get(childs[0].target) : null;
  }
  return ctx;
}

// After a fanout, find the next `merge` node by walking from any one branch
// child until we hit it. Returns null if the branches don't reconverge.
function findMergeAfter(
  nodeById: Map<string, any>,
  childrenOf: Map<string, Array<{ target: string; sourceHandle?: string }>>,
  fanoutId: string,
): any {
  const childs = childrenOf.get(fanoutId) || [];
  if (childs.length === 0) return null;
  let cur = nodeById.get(childs[0].target);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    const kind = String(cur.type || cur.data?.kind || '').toLowerCase();
    if (kind === 'merge') {
      const next = (childrenOf.get(cur.id) || [])[0];
      return next ? nodeById.get(next.target) : null;
    }
    const next = (childrenOf.get(cur.id) || [])[0];
    cur = next ? nodeById.get(next.target) : null;
  }
  return null;
}
