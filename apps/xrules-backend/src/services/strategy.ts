// Strategy steps for decision flows: Items → Filter → Score → Rank → Pick.
// They work on one list (ctx.items); every item that leaves the list is kept in ctx.dropped with the reason,
// so a test run can say why each request was not chosen.
import { evalExpression } from './sandbox.service.js';
import * as datasets from '../data/datasets-runtime.js';
import { CALC_FUNCS, calcExpr } from './execute.service.js';

type Ctx = Record<string, any>;
const scope = (ctx: Ctx, item: any) => ({ ...ctx.input, ...item, item, input: ctx.input, ...CALC_FUNCS, Math });
const ev = (expr: string, ctx: Ctx, item?: any) => evalExpression(calcExpr(expr), item ? scope(ctx, item) : { ...ctx.input, input: ctx.input, ...ctx, ...CALC_FUNCS, Math });
const read = (o: any, p: string) => String(p).split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
const drop = (ctx: Ctx, item: any, step: string, reason: string) => { (ctx.dropped ||= []).push({ ...item, droppedAt: step, reason }); };

export async function items(data: any, ctx: Ctx, projectId?: string) {
  let rows: any[] = [];
  if (data.dataset && projectId) {
    const ds = await datasets.findDataset(projectId, String(data.dataset));
    if (!ds?.activeSnapshotId) throw new Error(`Data set '${data.dataset}' has no data yet`);
    rows = (await datasets.previewRows(ds.activeSnapshotId, Number(data.limit) || 5000)).map((r: any) => r.data);
  } else {
    rows = read(ctx, String(data.from || 'input.items')) || [];
  }
  if (!Array.isArray(rows)) throw new Error('Items must be a list');
  ctx.items = rows.map(r => ({ ...r })); ctx.dropped = [];
  return { count: ctx.items.length };
}

export function filter(data: any, ctx: Ctx, label: string) {
  if (!data.condition) return { kept: (ctx.items || []).length, removed: 0 };
  const keep: any[] = [];
  for (const it of ctx.items || []) {
    let ok = false; try { ok = !!ev(String(data.condition), ctx, it); } catch { ok = false; }
    if (ok) keep.push(it); else drop(ctx, it, label, data.reason || `Did not pass "${label}"`);
  }
  const removed = (ctx.items || []).length - keep.length; ctx.items = keep;
  return { kept: keep.length, removed };
}

export async function score(data: any, ctx: Ctx, solve: (slug: string, input: any) => Promise<any>) {
  const as = String(data.outputAs || 'score');
  for (const it of ctx.items || []) {
    if (data.ruleSlug) {
      const out = await solve(String(data.ruleSlug), { ...ctx.input, ...it });
      it[as] = out && typeof out === 'object' ? (data.pick ? read(out, data.pick) : (out.score ?? out.result ?? Object.values(out)[0])) : out;
    } else if (data.expression) it[as] = ev(String(data.expression), ctx, it);
  }
  const xs = (ctx.items || []).map((i: any) => Number(i[as])).filter((n: number) => !isNaN(n));
  return { scored: xs.length, average: xs.length ? Math.round((xs.reduce((a: number, b: number) => a + b, 0) / xs.length) * 100) / 100 : null };
}

/** priority = Σ weight × value; weights are what the business moves with sliders */
export function rank(data: any, ctx: Ctx) {
  const ws: { term: string; weight: number }[] = (data.weights || []).filter((w: any) => w.term);
  const as = String(data.outputAs || 'priority');
  for (const it of ctx.items || []) it[as] = Math.round(ws.reduce((s, w) => s + Number(w.weight || 0) * (Number(read(it, w.term)) || 0), 0) * 1000) / 1000;
  ctx.items.sort((a: any, b: any) => (b[as] - a[as]));
  ctx.items.forEach((it: any, i: number) => { it.rank = i + 1; });
  return { ranked: ctx.items.length, top: ctx.items[0]?.[as] ?? null };
}

/** top N, or walk down the ranking funding each item while the budget lasts */
export function pick(data: any, ctx: Ctx, label: string) {
  const list: any[] = ctx.items || []; const chosen: any[] = [];
  if (data.mode === 'budget') {
    const budget = typeof data.budget === 'number' ? data.budget : Number(ev(String(data.budget ?? 0), ctx));
    const cost = String(data.cost || 'amount'); let left = budget;
    for (const it of list) {
      const c = Number(read(it, cost)) || 0;
      if (c <= left) { chosen.push({ ...it, allocated: c }); left -= c; }
      else if (data.partial && left > 0) { chosen.push({ ...it, allocated: left, partial: true }); left = 0; }
      else drop(ctx, it, label, `Budget left ${left.toLocaleString('en-US')} is less than ${c.toLocaleString('en-US')}`);
    }
    ctx.picked = chosen; ctx.allocation = { budget, used: budget - left, left };
    return { picked: chosen.length, used: budget - left, left };
  }
  const n = Number(data.n) || 1;
  list.forEach((it, i) => (i < n ? chosen.push(it) : drop(ctx, it, label, `Ranked ${i + 1}, only the top ${n} are picked`)));
  ctx.picked = chosen;
  return { picked: chosen.length };
}
