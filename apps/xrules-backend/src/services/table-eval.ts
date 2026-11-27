// Decision tables whose lines use "or" groups or raise reason codes are evaluated here, in the API.
// A line: { inputs: [cell per column], match?: 'all'|'any', or?: [{ match?, when: { column: cell } }], reasons?: [code] }
// The line matches when any of its groups matches; a group matches all (or any) of its non-blank cells.
// The same cell language as the table: "-", "= x", "!= x", "< n", "<= n", "> n", ">= n", "BTW a AND b",
// "BTW LO/RO", "!BTW", "IN a,b", "!IN a,b", "null", "!null"/"not null", or a bare value (equals).

import { AsyncLocalStorage } from 'node:async_hooks';
import { evalExpression } from './sandbox.service.js';
import { compileExpr, getter, pathsOf, asWordValue } from './expr.js';

// The decision date: "today", "days since", "N days ago" read it; a topic or a test case sets it, else the real date.
const AS_OF = new AsyncLocalStorage<{ asOf: Date | null }>();
export function withDecisionDate<T>(d: any, fn: () => T): T { return AS_OF.run({ asOf: d ? toDate(d) : null }, fn); }
/** Inside a run that already has a decision date: keep it. Else the case's own date, else the topic's. */
export async function withTopicDate<T>(input: any, topicDate: () => Promise<any>, fn: () => Promise<T>): Promise<T> {
  if (AS_OF.getStore()) return fn();
  const d = decisionDateIn(input) || (await topicDate());
  return AS_OF.run({ asOf: d ? toDate(d) : null }, fn);
}
/** A decision date carried by the data (a "decision date" / "decisionDate" field), if any. */
export function decisionDateIn(input: any): any {
  if (!input || typeof input !== 'object') return null;
  const k = Object.keys(input).find(x => /^(_|as[ _-]?of[ _-]?)?decision[ _-]?date$|^as[ _-]?of$/i.test(x.replace(/\s+/g, ' ')));
  return k ? input[k] : null;
}

type Group = { match?: string; cells: { name: string; cell: any }[] };
type Reason = { code: string; text: string; outcome: string; result?: string | null; priority: number };

const blank = (c: any) => c === null || c === undefined || (typeof c === 'string' && ['', '-', 'any'].includes(c.trim().toLowerCase()));
export const isElseCell = (c: any) => typeof c === 'string' && ['else', '_else_'].includes(c.trim().toLowerCase());
const plainGet = (o: any, path: string) => (o && typeof o === 'object' && path in o ? o[path] : String(path).split('.').reduce((a, k) => (a == null ? undefined : a[k]), o));

// ---- multi-level data: paths through lists (bureau_accounts[].payments[].days_past_due), aggregate words (@name),
// "any:" / "all:" columns over a list, tables run per item of a list, and value sets (codes, groups, extra columns).
type Entry = { v: any; at: string[] };
type Frame = { list: string; item: any; at: string[] };
type ProjectCtx = { words?: { term: string; path: string }[]; aggs: Record<string, any>; sets: Record<string, { name: string; rows: any[]; groups: Record<string, string[]>; columns: string[] }> };
let CTX: ProjectCtx | null = null; let ROOT: any = null; let FRAMES: Frame[] = []; let FIRED: string[][] = [];
const singular = (k: string) => k.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/[_\-]+/g, ' ').toLowerCase().replace(/ies$/, 'y').replace(/(?<!s)s$/, '');
/** Every value at a path, each with the list items it came through ("bureau account 3", "payment 5"). */
export function walk(o: any, path: string, at: string[] = []): Entry[] {
  let cur: Entry[] = [{ v: o, at }];
  for (const seg of String(path).split('.').filter(Boolean)) {
    const isList = seg.endsWith('[]'); const key = isList ? seg.slice(0, -2) : seg; const next: Entry[] = [];
    for (const c of cur) {
      const x = key === '' ? c.v : c.v && typeof c.v === 'object' ? c.v[key] : undefined;
      if (isList) (Array.isArray(x) ? x : []).forEach((it, i) => next.push({ v: it, at: [...c.at, `${singular(key) || 'item'} ${i + 1}`] }));
      else next.push({ v: x, at: c.at });
    }
    cur = next;
  }
  return cur;
}
/** A path read where the current list item (a per-item table, an aggregate) is in force. */
function resolveAll(path: string): Entry[] {
  for (let i = FRAMES.length - 1; i >= 0; i--) { const f = FRAMES[i]; if (path.startsWith(f.list + '.')) return walk(f.item, path.slice(f.list.length + 1), f.at); }
  return walk(ROOT, path);
}
const hasList = (p: string) => p.includes('[]');
function aggValue(path: string): any {
  const a = CTX?.aggs?.[path]; if (!a || !a.list) return undefined;
  const list = String(a.list).endsWith('[]') ? String(a.list) : `${a.list}[]`;
  const rel = (f: string) => (f.startsWith(list + '.') ? f.slice(list.length + 1) : f);
  const vals: number[] = [];
  for (const e of resolveAll(list)) {
    FRAMES.push({ list, item: e.v, at: e.at });
    try {
      const conds = (Array.isArray(a.where) ? a.where : a.where ? [a.where] : []).filter((w: any) => w?.field && !blank(w.cell));
      if (!conds.every((w: any) => matchCell(w.cell, valueAt(`${list}.${rel(String(w.field))}`, w.field), ROOT))) continue;
      if (String(a.fn).toLowerCase() === 'count') { vals.push(1); continue; }
      const v = num(valueAt(`${list}.${rel(String(a.field || ''))}`, a.field)); if (!isNaN(v)) vals.push(v);
    } finally { FRAMES.pop(); }
  }
  switch (String(a.fn).toLowerCase()) {
    case 'count': return vals.length;
    case 'sum': return vals.reduce((x, y) => x + y, 0);
    case 'max': return vals.length ? Math.max(...vals) : null;
    case 'min': return vals.length ? Math.min(...vals) : null;
    case 'avg': return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null;
  }
  return null;
}
function valueAt(full: string, field?: string): any {
  if (field && String(field).startsWith('@')) return aggValue(String(field));
  const es = resolveAll(full); const rest = FRAMES.length && full.startsWith(FRAMES[FRAMES.length - 1].list + '.') ? full.slice(FRAMES[FRAMES.length - 1].list.length + 1) : full;
  return hasList(rest) ? es.map(e => e.v) : es[0]?.v;
}
/** value-set lookups: "margin of business_type" */
function setExtra(word: string, column: string, scope: any): any {
  const vs = CTX?.sets?.[word]; if (!vs) return undefined;
  const code = get(scope, word); const row = vs.rows.find((r: any) => String(r.code) === String(code));
  return row?.extra?.[column] ?? null;
}
const get = (o: any, path: string): any => {
  const p = String(path);
  if (p.startsWith('@')) return aggValue(p);
  if (o && typeof o === 'object' && p in o) return o[p];
  if (hasList(p) || FRAMES.length) return valueAt(p);
  const v = plainGet(o, p);
  if (v === undefined && CTX && p.includes('.')) { const i = p.lastIndexOf('.'); const w = p.slice(0, i); if (CTX.sets[w]) return setExtra(w, p.slice(i + 1), o); }
  return v;
};
const inGroup = (actual: any, g: string) => Object.values(CTX?.sets || {}).some(s => (s.groups?.[g] || []).map(String).includes(String(actual)));
const num = (v: any) => (v === '' || v === null || v === undefined ? NaN : Number(String(v).replace(/,/g, '')));
const unq = (s: string) => s.trim().replace(/^["']|["']$/g, '');
const list = (s: string) => String(s ?? '').replace(/^\[|\]$/g, '').split(',').map(unq).filter(x => x !== '');
const same = (a: any, b: string) => { if (/^GROUP:/i.test(String(b).trim())) return inGroup(a, unq(String(b)).replace(/^GROUP:\s*/i, '')); const n = num(b); return typeof a === 'number' || (!isNaN(n) && !isNaN(num(a)) && typeof a !== 'boolean') ? num(a) === n : String(a) === unq(b); };

// ---- dates and small formulas inside a line ("is at least monthly_income * 0.8", "is after 180 days ago")
/** A date from 20250115 / "2025-01-15" / an ISO time / a Date; null when it is not one. */
export function toDate(v: any): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})(\d{2})(\d{2})$/) || s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) { const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return isNaN(d.getTime()) ? null : d; }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return null;
}
const today = () => { const a = AS_OF.getStore()?.asOf; if (a) return new Date(a.getTime()); const n = new Date(); return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())); };
const DAY = 86400000;
const txt = (v: any) => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10).replace(/-/g, '') : String(v));
const cnt = (n: any, d = 1) => { const x = Number(n); return n === undefined || n === null || n === '' || isNaN(x) ? d : Math.max(0, Math.floor(x)); };
/** Text and list functions. Positions count from 1. A list is a real list or text split by ":" (SPLIT and ITEM take
 *  another separator as their last value). CONTAINS reads a list when the value is one (or has ":" / ","), else text. */
export const TEXT_FUNCS = {
  LEFT: (t: any, n?: any) => txt(t).slice(0, cnt(n)),
  RIGHT: (t: any, n?: any) => { const s = txt(t), k = cnt(n); return k ? s.slice(-k) : ''; },
  MID: (t: any, start: any, n?: any) => { const s = txt(t), a = Math.max(1, cnt(start)); return n === undefined ? s.slice(a - 1) : s.slice(a - 1, a - 1 + cnt(n, 0)); },
  LEN: (t: any) => (Array.isArray(t) ? t.length : txt(t).length),
  UPPER: (t: any) => txt(t).toUpperCase(),
  LOWER: (t: any) => txt(t).toLowerCase(),
  TRIM: (t: any) => txt(t).trim().replace(/\s+/g, ' '),
  STARTSWITH: (t: any, p: any) => txt(t).startsWith(txt(p)),
  ENDSWITH: (t: any, p: any) => txt(t).endsWith(txt(p)),
  SPLIT: (v: any, sep: any = ':') => (Array.isArray(v) ? v : txt(v).split(txt(sep) || ':').map(s => s.trim()).filter(s => s !== '')),
  ITEM: (list: any, i: any, sep: any = ':') => { const xs = Array.isArray(list) ? list : txt(list).split(txt(sep) || ':').map(s => s.trim()); const k = Number(i); return !isNaN(k) && k >= 1 ? xs[k - 1] ?? null : k < 0 ? xs[xs.length + k] ?? null : null; },
  // reasons raised so far in the run ("has reason M005", "has a Reject reason"); outcomes compare without case
  __has: (list: any, ...xs: any[]) => { const have = (Array.isArray(list) ? list : []).map(x => txt(x).trim().toLowerCase()); return xs.flat().some(x => have.includes(txt(x).trim().toLowerCase())); },
  CONTAINS: (list: any, v: any) => (Array.isArray(list) ? list.map(x => txt(x).trim()).includes(txt(v).trim()) : /[:,]/.test(txt(list)) ? txt(list).split(/[:,]/).map(s => s.trim()).includes(txt(v).trim()) : txt(list).includes(txt(v))),
};
/** Functions a calculation or a line's value can use. */
export const DATE_FUNCS = {
  TODAY: () => today(),
  DATE: (v: any) => toDate(v),
  DAYS: (a: any, b?: any) => { const x = toDate(a), y = b === undefined ? today() : toDate(b); return x && y ? Math.round((y.getTime() - x.getTime()) / DAY) : null; },
  MONTHS: (a: any, b?: any) => { const x = toDate(a), y = b === undefined ? today() : toDate(b); return x && y ? (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + (y.getUTCMonth() - x.getUTCMonth()) - (y.getUTCDate() < x.getUTCDate() ? 1 : 0) : null; },
  YEARS: (a: any, b?: any) => { const m = DATE_FUNCS.MONTHS(a, b); return m === null ? null : Math.floor(m / 12); },
  ADD_DAYS: (a: any, n: any) => { const x = toDate(a); return x ? new Date(x.getTime() + Number(n) * DAY) : null; },
  ...TEXT_FUNCS,
  TEXT: (v: any) => (v instanceof Date ? v.toISOString().slice(0, 10).replace(/-/g, '') : String(v ?? '')),
  // two lists read side by side: codes "003:004" with dates "20251015:20251101" (code k goes with date k)
  ZIP: (a: any, b: any, na = 'code', nb = 'date') => { const x = asList(a), y = asList(b); return x.map((v, i) => ({ [na]: v, [nb]: y[i] ?? null })); },
  ANY_PAIR: (codes: any, dates: any, which: any, days?: any) => pairHits(codes, dates, which, days) > 0,
  COUNT_PAIRS: (codes: any, dates: any, which: any, days?: any) => pairHits(codes, dates, which, days),
};
const asList = (v: any): any[] => (Array.isArray(v) ? v : String(v ?? '').split(':').map(s => s.trim()).filter(s => s !== ''));
/** How many pairs have a code in `which` ("003,004", or per-code windows "003=180,004=90") and a date at most `days`
 *  days before the decision date (no days: any date). */
function pairHits(codes: any, dates: any, which: any, days?: any): number {
  const cs = asList(codes), ds = asList(dates);
  const win = new Map<string, number | null>();
  (Array.isArray(which) ? which : String(which ?? '').split(/[,\s]+/)).map(String).filter(Boolean).forEach(w => { const [c, d] = w.split('='); win.set(c.trim(), d !== undefined ? Number(d) : days === undefined || days === null || days === '' ? null : Number(days)); });
  let n = 0;
  cs.forEach((c, i) => {
    const key = String(c).trim(); if (win.size && !win.has(key)) return;
    const lim = win.size ? win.get(key) : days === undefined ? null : Number(days);
    if (lim === null || lim === undefined || isNaN(lim)) { n++; return; }
    const ago = DATE_FUNCS.DAYS(ds[i]); if (ago !== null && ago >= 0 && ago <= lim) n++;
  });
  return n;
}
/** "today", "180 days ago", "in 2 months" → a date */
export function relDate(s: string): Date | null {
  const t = s.trim().toLowerCase();
  if (t === 'today') return today();
  const m = t.match(/^(\d+)\s*(day|week|month|year)s?\s+ago$/) || t.match(/^in\s+(\d+)\s*(day|week|month|year)s?$/);
  if (!m) return null;
  const n = (t.startsWith('in') ? 1 : -1) * Number(m[1]); const d = today();
  if (m[2] === 'day') d.setUTCDate(d.getUTCDate() + n); else if (m[2] === 'week') d.setUTCDate(d.getUTCDate() + 7 * n);
  else if (m[2] === 'month') d.setUTCMonth(d.getUTCMonth() + n); else d.setUTCFullYear(d.getUTCFullYear() + n);
  return d;
}
/** A value side that is a small formula of words and numbers rather than a plain value. */
export const isFormulaArg = (arg: string, op = '>') => {
  const a = String(arg ?? '').trim(); if (!a || !isNaN(num(a)) || relDate(a)) return false;
  return /[*/+×÷()]|\s-\s/.test(a) || /^[A-Z_]+\(/.test(a) || (['>', '>=', '<', '<='].includes(op) && /[A-Za-z_]/.test(a));
};
/** Word names written as shown ("employee income") turned into their data paths, outside quoted text. */
function labelsToPaths(text: string): string {
  const ws = (CTX?.words || []).filter(w => w.term && w.path && w.term !== w.path).sort((a, b) => b.term.length - a.term.length);
  if (!ws.length) return text;
  return String(text).split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/).map((part, i) => {
    if (i % 2) return part;
    let out = part;
    for (const w of ws) out = out.replace(new RegExp(`(?<![\\w.])${w.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`, 'gi'), `\u0003${w.path}\u0003`);
    return out.replace(/\u0003/g, '');
  }).join('');
}
function formulaValue(arg: string, scope: any): any {
  const e = labelsToPaths(String(arg))
    // "margin of business_type" reads an extra column of the word's value set; @words are aggregates
    .replace(/\b([A-Za-z_]\w*) of ([A-Za-z_][\w.]*)/g, (_m, c, w) => `__of(${JSON.stringify(w)}, ${JSON.stringify(c)})`)
    .replace(/@([A-Za-z_]\w*)/g, (_m, n) => `__agg(${JSON.stringify('@' + n)})`);
  const paths = [...(CTX?.words || []).map(w => w.path), ...pathsOf(scope)];
  try { return evalExpression(compileExpr(e, paths, [...Object.keys(DATE_FUNCS), '__of', '__agg', 'IF', 'MIN', 'MAX', 'ROUND', 'OR', 'AND', 'SUM']), { __get: (p: string) => asWordValue(getter(scope)(p)), ...DATE_FUNCS, ...SMALL_FUNCS, Math, __of: (w: string, c: string) => setExtra(w, c, scope), __agg: (p: string) => aggValue(p) }); } catch { return undefined; }
}
const SMALL_FUNCS = {
  IF: (c: any, a: any, b: any) => (c ? a : b),
  MIN: (...a: any[]) => Math.min(...a.flat().map(Number)), MAX: (...a: any[]) => Math.max(...a.flat().map(Number)),
  ROUND: (x: any, d = 0) => { const f = Math.pow(10, d); return Math.round(Number(x) * f) / f; },
  OR: (...a: any[]) => a.some(Boolean), AND: (...a: any[]) => a.every(Boolean),
  SUM: (...a: any[]) => a.flat().map((x: any) => asWordValue(x)).reduce((s: number, x: any) => s + (Number(x) || 0), 0),
};
/** A result value: a number or quoted text stays; a word or a formula of words is worked out. */
export function resultValue(cell: any, scope: any): any {
  if (typeof cell !== 'string') return cell;
  const s = cell.trim(); if (!s || !isNaN(num(s))) return cell;
  if (/^"[^"]*"$|^'[^']*'$/.test(s)) return s.slice(1, -1);
  const withPaths = labelsToPaths(s);
  const paths = new Set([...(CTX?.words || []).map(w => w.path), ...pathsOf(scope)]);
  const namesWord = Array.from(paths).some(p => p && new RegExp(`(?<![\\w.])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`).test(withPaths));
  const looksLikeFormula = /[*/+×÷()−]|\s-\s|^[A-Z_]+\(|^if\b/i.test(s);
  if (!namesWord && !looksLikeFormula) return cell;
  const v = formulaValue(s, scope);
  if (v === undefined || (typeof v === 'number' && isNaN(v))) return namesWord ? null : cell;
  return v;
}

export function matchCell(cell: any, actual: any, scope?: any): boolean {
  if (blank(cell) || isElseCell(cell)) return true;
  if (typeof cell !== 'string') return actual === cell || String(actual) === String(cell);
  const s = cell.trim(); const u = s.toUpperCase();
  const empty = actual === undefined || actual === null || actual === '' || (Array.isArray(actual) && !actual.length);
  // a list (such as the reasons so far): "is" / "is one of" hold when any item does, "is not" when none does
  if (Array.isArray(actual) && !/^!?NULL$|^NOT NULL$/.test(u)) {
    const neg = /^(!=|!IN)/i.test(s);
    const pos = neg ? s.replace(/^!(=|IN)/i, (_m, x) => (x === '=' ? '=' : 'IN')) : s;
    const anyHit = actual.some(a => matchCell(pos, a, scope));
    return neg ? !anyHit : anyHit;
  }
  if (u === 'NULL') return empty;
  if (u === '!NULL' || u === 'NOT NULL') return !empty;
  const btw = s.match(/^(!?BTW(?:\s+LO|\s+RO)?)\s*(.*?)\s+AND\s*(.*)$/i);
  if (btw) {
    const op = btw[1].toUpperCase().replace(/\s+/g, ' '); const a = num(btw[2]), b = num(btw[3]), v = num(actual);
    if (isNaN(v)) return op.startsWith('!');
    const inside = op === 'BTW LO' ? v > a && v <= b : op === 'BTW RO' ? v >= a && v < b : v >= a && v <= b;
    return op.startsWith('!') ? !inside : inside;
  }
  const m = s.match(/^(>=|<=|!=|>|<|=|!IN|IN)\s*(.*)$/i);
  if (!m) return same(actual, s);
  const op = m[1].toUpperCase(); const arg = m[2];
  switch (op) {
    case '=': return isFormulaArg(arg, op) ? same(actual, String(formulaValue(arg, scope))) : same(actual, arg);
    case '!=': return isFormulaArg(arg, op) ? !same(actual, String(formulaValue(arg, scope))) : !same(actual, arg);
    case 'IN': return list(arg).some(x => same(actual, x));
    case '!IN': return !list(arg).some(x => same(actual, x));
    default: {
      // dates: "is after 180 days ago", or a formula that works out a date
      const rd = relDate(arg) || (isFormulaArg(arg, op) ? (() => { const x = formulaValue(arg, scope); return x instanceof Date ? x : null; })() : null);
      const ad = toDate(actual);
      if (rd || (ad && toDate(arg) && String(arg).replace(/\D/g, '').length === 8)) {
        const x = ad?.getTime(), y = (rd || toDate(arg))!.getTime(); if (x === undefined) return false;
        return op === '>' ? x > y : op === '>=' ? x >= y : op === '<' ? x < y : x <= y;
      }
      let a = num(arg);
      if (isNaN(a) && isFormulaArg(arg, op)) a = num(formulaValue(arg, scope));
      const v = num(actual); if (isNaN(v) || isNaN(a)) return false;
      return op === '>' ? v > a : op === '>=' ? v >= a : op === '<' ? v < a : v <= a;
    }
  }
}

export function groupsOf(def: any, row: any): Group[] {
  const cols: any[] = def?.inputs || [];
  // "more": further conditions on a word that already has one in this line ("line is less than prod min and line is at least 0")
  const more = (Array.isArray(row?.more) ? row.more : []).map((m: any) => ({ name: String(m?.name || ''), cell: m?.cell })).filter((x: any) => x.name && !blank(x.cell));
  const main: Group = { match: row?.match, cells: [...cols.map((c, i) => ({ name: c.name, cell: row?.inputs?.[i] })).filter(x => !blank(x.cell) && !isElseCell(x.cell)), ...more] };
  const extra: Group[] = (Array.isArray(row?.or) ? row.or : []).map((g: any) => ({ match: g?.match, cells: Object.entries(g?.when || {}).map(([name, cell]) => ({ name, cell })).filter(x => !blank(x.cell)) }));
  return [main, ...extra].filter(g => g.cells.length);
}

/** One condition: a plain word, or a word over a list ("any:" / "all:", or a list path read as any). */
function cellHolds(name: string, cell: any, input: any): boolean {
  const q = String(name).match(/^(any|all):(.*)$/); const path = q ? q[2] : String(name);
  if (!q && !hasList(path)) return matchCell(cell, get(input, path), input);
  if (!q && FRAMES.length && !hasList(path.slice(FRAMES[FRAMES.length - 1].list.length + 1)) && path.startsWith(FRAMES[FRAMES.length - 1].list + '.')) return matchCell(cell, get(input, path), input);
  const es = resolveAll(path);
  if (q?.[1] === 'all') return es.length > 0 && es.every(e => matchCell(cell, e.v, input));
  const hit = es.find(e => matchCell(cell, e.v, input)); if (hit && hit.at.length) FIRED.push(hit.at);
  return !!hit;
}
export function rowMatches(def: any, row: any, input: any): boolean {
  const gs = groupsOf(def, row);
  if (!gs.length) return true;
  return gs.some(g => g.match === 'any' ? g.cells.some(c => cellHolds(c.name, c.cell, input)) : g.cells.every(c => cellHolds(c.name, c.cell, input)));
}

const cellUsesFormula = (c: any) => { if (typeof c !== 'string') return false; const m = c.trim().match(/^(>=|<=|!=|>|<|=)\s*(.*)$/); return !!m && (isFormulaArg(m[2], m[1]) || !!relDate(m[2]) || (['>', '>=', '<', '<='].includes(m[1]) && /^\d{8}$/.test(m[2].trim()))); };
/** A line value that is a formula or a date only this evaluator understands. */
export const usesFormulas = (def: any) => (def?.rules || []).some((r: any) => (r?.inputs || []).some(cellUsesFormula) || (Array.isArray(r?.or) && r.or.some((g: any) => Object.values(g?.when || {}).some(cellUsesFormula))));
/** Lists, aggregates, per-item tables and value-set groups run only in this evaluator. */
export const usesLists = (def: any) => !!def?.perItem?.list || (def?.inputs || []).some((c: any) => /\[\]|^@|^(any|all):/.test(String(c?.name || ''))) || /GROUP:|@[A-Za-z_]| of [A-Za-z_]/.test(JSON.stringify(def?.rules || []));
/** A result cell that is a word or formula rather than a plain value (or quoted text). */
export const usesResultFormulas = (def: any) => (def?.rules || []).some((r: any) => (r?.outputs || []).some((c: any) => typeof c === 'string' && isNaN(num(c)) && !/^"[^"]*"$/.test(c.trim()) && (/[*/+×÷()−]|\s-\s|^if\b/i.test(c) || /\s|[._]/.test(c.trim()))));
export const usesGroupsOrReasons = (def: any) => usesFormulas(def) || usesResultFormulas(def) || usesLists(def) || (def?.rules || []).some((r: any) => (Array.isArray(r?.or) && r.or.length) || r?.match === 'any' || (Array.isArray(r?.reasons) && r.reasons.length) || (Array.isArray(r?.more) && r.more.length)) || usesReasons(def);
export const usesReasons = (def: any) => (def?.rules || []).some((r: any) => (Array.isArray(r?.reasons) && r.reasons.length) || (Array.isArray(r?.clear) && r.clear.length) || (typeof r?.decision === 'string' && r.decision.trim()));

/** Lines with "or" groups as plain rows for an engine that only knows AND rows (one row per alternative). */
export function expandForEngine(def: any): any[] {
  const cols: any[] = def?.inputs || [];
  const out: any[] = [];
  (def?.rules || []).forEach((r: any, i: number) => {
    const id = r.id || `row-${i + 1}`;
    const gs = groupsOf(def, r);
    if (!gs.length || (gs.length === 1 && gs[0].match !== 'any' && !(r.or || []).length)) { out.push({ id, inputs: r.inputs || [], outputs: r.outputs || [] }); return; }
    const alts: { name: string; cell: any }[][] = [];
    for (const g of gs) { if (g.match === 'any') g.cells.forEach(c => alts.push([c])); else alts.push(g.cells); }
    alts.forEach((cells, k) => out.push({ id: `${id}#${k + 1}`, inputs: cols.map(c => { const hit = cells.find(x => x.name === c.name); return hit ? hit.cell : '-'; }), outputs: r.outputs || [] }));
  });
  return out;
}

/** Run the whole table here. Hit policies as the studio names them: FIRST_MATCH · STANDARD · ARRAY · EVALUATE_ALL. */
export function evaluateTable(def: any, input: any, catalogue: Reason[] = []): any {
  const prev = { CTX, ROOT, FRAMES, FIRED };
  CTX = (catalogue as any)?.project || null; ROOT = input; FRAMES = []; FIRED = [];
  try { return evaluateIn(def, input, catalogue); } finally { ({ CTX, ROOT, FRAMES, FIRED } = prev); }
}
function evaluateIn(def: any, input: any, catalogue: Reason[]): any {
  const outs: string[] = (def?.outputs || []).map((o: any) => o.name);
  const policy = String(def?.hitPolicy || 'STANDARD').toUpperCase();
  const first = policy === 'FIRST' || policy === 'FIRST_MATCH' || policy === 'UNIQUE' || policy === 'ANY';
  const rows: any[] = def?.rules || [];
  const elseRow = rows.find(r => Array.isArray(r?.inputs) && r.inputs.some(isElseCell));
  const value = (r: any) => { const o: Record<string, any> = {}; outs.forEach((n, i) => { o[n] = resultValue(r?.outputs?.[i] ?? null, { ...(input || {}), ...frameScope() }); }); return o; };
  const frameScope = () => (FRAMES.length ? { [FRAMES[FRAMES.length - 1].list.replace(/\[\]$/, '')]: FRAMES[FRAMES.length - 1].item } : {});
  const hits: any[] = []; const all: any[] = []; const trace: string[] = [];
  const tag = (r: any) => (Array.isArray(r?.reasons) && r.reasons.length ? r.reasons.join(', ') : outs.length ? outs.map((n, i) => `${n} ${r?.outputs?.[i] ?? ''}`).join(', ') : `line ${rows.indexOf(r) + 1}`);
  const runLines = (where?: string[]) => {
    const got: any[] = [];
    for (const r of rows) {
      if (r === elseRow) continue;
      FIRED = [];
      const ok = rowMatches(def, r, input);
      if (policy === 'EVALUATE_ALL' && !where) all.push({ _match: ok, ...value(r) });
      if (ok) {
        const at = where?.length ? where.join(' · ') : FIRED[0]?.join(' · ');
        if (at) trace.push(`${at} → ${tag(r)}`);
        got.push(r); if (first) break;
      }
    }
    return got;
  };
  const per = def?.perItem?.list ? String(def.perItem.list).replace(/(\[\])?$/, '[]') : '';
  const perItems: { row: any; at: string }[] = [];
  if (per) {
    // the table runs once per item of the list; "first" stops at the first item with a matching line
    for (const e of walk(input, per)) {
      FRAMES = [{ list: per, item: e.v, at: e.at }];
      const got = runLines(e.at);
      FRAMES = [];
      got.forEach(r => perItems.push({ row: r, at: e.at.join(' · ') }));
      if (got.length) hits.push(...got);
      if (got.length && def.perItem.rollup === 'first') break;
    }
  } else hits.push(...runLines());
  if (!hits.length && elseRow) hits.push(elseRow);
  let result: any;
  if (policy === 'EVALUATE_ALL') result = all;
  else if (first) result = hits[0] ? value(hits[0]) : null;
  else if (policy === 'ARRAY') { const cols: Record<string, unknown[]> = {}; for (const h of hits) for (const [k, v] of Object.entries(value(h))) (cols[k] ||= []).push(v); result = cols; }
  else result = hits.map(value);
  if (per && perItems.length) result = first || def.perItem.rollup === 'first' ? { ...value(perItems[0].row), _item: perItems[0].at } : perItems.map(h => ({ _item: h.at, ...value(h.row) }));
  // the item that fired, and values that are not in the word's value set
  const extra: any = {};
  if (trace.length) extra._trace = trace;
  const unknown: string[] = [];
  for (const c of def?.inputs || []) {
    const p = String(c?.name || '').replace(/^(any|all):/, ''); const vs = CTX?.sets?.[p]; if (!vs) continue;
    const vals = hasList(p) ? walk(input, p).map(e => e.v) : [get(input, p)];
    for (const v of vals) if (v !== undefined && v !== null && v !== '' && !vs.rows.some((r: any) => String(r.code) === String(v))) unknown.push(`${v} is not in ${vs.name}`);
  }
  if (unknown.length) extra._unknown = Array.from(new Set(unknown));
  const withExtra = (x: any) => (!Object.keys(extra).length ? x : x && typeof x === 'object' && !Array.isArray(x) ? { ...x, ...extra } : { result: x, ...extra });
  if (!usesReasons(def)) return withExtra(result);

  // reasons: every code the matching lines raise, the top one by priority, and its outcome; lines can also clear
  // reasons raised by earlier steps (codes, "outcome:Reject" or "all") and set the decision
  const codes = Array.from(new Set(hits.flatMap((h: any) => (Array.isArray(h.reasons) ? h.reasons : []).map(String))));
  const clears = Array.from(new Set(hits.flatMap((h: any) => (Array.isArray(h.clear) ? h.clear : []).map(String))));
  const decided = [...hits].reverse().find((h: any) => typeof h?.decision === 'string' && h.decision.trim())?.decision?.trim();
  if (clears.length) extra.clear = clears;
  if (decided) extra.setDecision = decided;
  const known = codes.map(c => catalogue.find(x => x.code === c) || { code: c, text: c, outcome: 'Decline', priority: Number.MAX_SAFE_INTEGER });
  const top = [...known].sort((a, b) => a.priority - b.priority)[0];
  const none = (catalogue as any)?.noReason || {};
  const reasons = { reasons: codes, reason: top?.code ?? null, reasonText: top?.text ?? null, outcome: top ? top.outcome : none.outcome || 'Approve',
    decisionResult: top ? (top as any).result || top.outcome : none.result || none.outcome || 'Approve' };
  if (!outs.length) return withExtra(reasons);
  if (result && typeof result === 'object' && !Array.isArray(result)) return withExtra({ ...result, ...reasons });
  return withExtra({ lines: result, ...reasons });
}
