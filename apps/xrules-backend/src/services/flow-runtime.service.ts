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

export async function runFlow(graph: FlowGraph, input: any, solve: SolveFn): Promise<any> {
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

  const start = graph.nodes.find(n => (n.type || n.data?.kind) === 'input');
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

    switch (kind) {
      case 'input':
        // Already seeded ctx.input; nothing to do.
        break;

      case 'output': {
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
        const mappedInput = data.inputMap ? renderObject(data.inputMap, ctx) : ctx.input;
        const out = await solve(String(slug), mappedInput);
        const key = data.outputAs || slug.toString().replace(/-/g, '_');
        ctx[key] = out;
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
          const branchCtx = await runBranch(nodeById, childrenOf, c.target, snapshot, solve);
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
): Promise<Record<string, any>> {
  const ctx: Record<string, any> = { ...snapshot };
  let cur = nodeById.get(startId);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    const kind = String(cur.type || cur.data?.kind || '').toLowerCase();
    if (kind === 'merge' || kind === 'output') break;
    const data = cur.data || {};

    if (kind === 'rulecall') {
      const slug = data.ruleSlug || data.rule || data.slug;
      if (slug) {
        const mappedInput = data.inputMap ? renderObject(data.inputMap, ctx) : ctx.input;
        const out = await solve(String(slug), mappedInput);
        const key = data.outputAs || String(slug).replace(/-/g, '_');
        ctx[key] = out;
      }
    } else if (kind === 'assign' || kind === 'transform') {
      if (data.target && data.expression) {
        const val = evalExpression(String(data.expression), { ...ctx, Math, Date, JSON });
        setPath(ctx, String(data.target), val);
      }
    }
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
