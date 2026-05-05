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
