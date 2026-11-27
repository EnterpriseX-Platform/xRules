// Overlap and gap checks for a decision table, told in plain words.
// Only claims what it can prove: cells it cannot read (text patterns, arrays) stop the check for that pair or column.
import { parseCellExpression } from './operators';

type Num = { k: 'num'; lo: number; loIn: boolean; hi: number; hiIn: boolean };
type Cond = { k: 'any' } | Num | { k: 'set'; vals: string[]; neg: boolean } | { k: 'null'; neg: boolean } | { k: '?' };
export type Finding = { kind: 'overlap' | 'gap'; rows: number[]; text: string };

const INF = Infinity;
const toNum = (v: any) => (v === '' || v === null || v === undefined || isNaN(Number(String(v).replace(/,/g, ''))) ? NaN : Number(String(v).replace(/,/g, '')));
const list = (v: any): string[] => (Array.isArray(v) ? v : String(v ?? '').replace(/^\[|\]$/g, '').split(',')).map(x => String(x).trim().replace(/^["']|["']$/g, '')).filter(Boolean);

function read(cell: any): Cond {
  const { operator: op, args } = parseCellExpression(cell);
  const a = toNum(args[0]), b = toNum(args[1]);
  switch (op) {
    case 'ANY': case 'ELSE': return { k: 'any' };
    case 'NULL': return { k: 'null', neg: false };
    case '!NULL': return { k: 'null', neg: true };
    case '>': return isNaN(a) ? { k: '?' } : { k: 'num', lo: a, loIn: false, hi: INF, hiIn: false };
    case '>=': return isNaN(a) ? { k: '?' } : { k: 'num', lo: a, loIn: true, hi: INF, hiIn: false };
    case '<': return isNaN(a) ? { k: '?' } : { k: 'num', lo: -INF, loIn: false, hi: a, hiIn: false };
    case '<=': return isNaN(a) ? { k: '?' } : { k: 'num', lo: -INF, loIn: false, hi: a, hiIn: true };
    case 'BTW': return isNaN(a) || isNaN(b) ? { k: '?' } : { k: 'num', lo: a, loIn: true, hi: b, hiIn: true };
    case 'BTW LO': return isNaN(a) || isNaN(b) ? { k: '?' } : { k: 'num', lo: a, loIn: false, hi: b, hiIn: true };
    case 'BTW RO': return isNaN(a) || isNaN(b) ? { k: '?' } : { k: 'num', lo: a, loIn: true, hi: b, hiIn: false };
    case '=': return !isNaN(a) ? { k: 'num', lo: a, loIn: true, hi: a, hiIn: true } : { k: 'set', vals: [String(args[0] ?? '')], neg: false };
    case '!=': return { k: 'set', vals: [String(args[0] ?? '')], neg: true };
    case 'IN': return { k: 'set', vals: list(args[0]), neg: false };
    case '!IN': return { k: 'set', vals: list(args[0]), neg: true };
    default: return { k: '?' };
  }
}

function meet(x: Cond, y: Cond): Cond | null | undefined {   // null = no common value · undefined = cannot tell
  if (x.k === '?' || y.k === '?') return undefined;
  if (x.k === 'any') return y; if (y.k === 'any') return x;
  if (x.k === 'null' || y.k === 'null') {
    if (x.k === 'null' && y.k === 'null') return x.neg === y.neg ? x : null;
    const n = (x.k === 'null' ? x : y) as any; const o = x.k === 'null' ? y : x;
    return n.neg ? o : null;
  }
  if (x.k === 'num' && y.k === 'num') {
    const lo = Math.max(x.lo, y.lo), hi = Math.min(x.hi, y.hi);
    const loIn = x.lo === y.lo ? x.loIn && y.loIn : (x.lo > y.lo ? x.loIn : y.loIn);
    const hiIn = x.hi === y.hi ? x.hiIn && y.hiIn : (x.hi < y.hi ? x.hiIn : y.hiIn);
    if (lo > hi || (lo === hi && !(loIn && hiIn))) return null;
    return { k: 'num', lo, loIn, hi, hiIn };
  }
  if (x.k === 'set' && y.k === 'set') {
    if (!x.neg && !y.neg) { const v = x.vals.filter(a => y.vals.includes(a)); return v.length ? { k: 'set', vals: v, neg: false } : null; }
    if (x.neg && y.neg) return { k: 'set', vals: Array.from(new Set([...x.vals, ...y.vals])), neg: true };
    const pos = x.neg ? y : x, neg = x.neg ? x : y;
    const v = (pos as any).vals.filter((a: string) => !(neg as any).vals.includes(a)); return v.length ? { k: 'set', vals: v, neg: false } : null;
  }
  // number against a list of values: keep the listed numbers inside the range
  const n = (x.k === 'num' ? x : y) as Num, s = (x.k === 'set' ? x : y) as any;
  if (s.neg) return n;
  const v = s.vals.filter((a: string) => { const k = toNum(a); return !isNaN(k) && (k > n.lo || (k === n.lo && n.loIn)) && (k < n.hi || (k === n.hi && n.hiIn)); });
  return v.length ? { k: 'set', vals: v, neg: false } : null;
}

export function rangeText(c: Cond, fmt: (n: number) => string): string {
  if (c.k === 'num') {
    if (c.lo === c.hi) return `= ${fmt(c.lo)}`;
    if (c.lo === -INF) return `${c.hiIn ? 'at most' : 'less than'} ${fmt(c.hi)}`;
    if (c.hi === INF) return `${c.loIn ? 'at least' : 'more than'} ${fmt(c.lo)}`;
    return `${c.loIn ? 'from' : 'over'} ${fmt(c.lo)} ${c.hiIn ? 'to' : 'up to, not including,'} ${fmt(c.hi)}`;
  }
  if (c.k === 'set') return `${c.neg ? 'not' : 'is'} ${c.vals.join(', ')}`;
  if (c.k === 'null') return c.neg ? 'given' : 'not given';
  return '';
}

export function tableChecks(def: any, label: (name: string) => string, fmt: (name: string, n: number) => string): Finding[] {
  const cols: any[] = def?.inputs || [];
  const rows: any[] = (def?.rules || []);
  if (!cols.length || !rows.length) return [];
  const grid: Cond[][] = rows.map(r => cols.map((_, i) => read(r.inputs?.[i])));
  const allAny = (ri: number) => grid[ri].every(c => c.k === 'any');
  const out: Finding[] = [];
  const first = ['FIRST', 'FIRST_MATCH'].includes(String(def?.hitPolicy || '').toUpperCase());
  const unique = String(def?.hitPolicy || '').toUpperCase() === 'UNIQUE';
  // lines with "or" groups are not plain intervals: leave them out of the checks
  const grouped = (ri: number) => (Array.isArray(rows[ri]?.or) && rows[ri].or.length > 0) || rows[ri]?.match === 'any';
  // "every line that matches" collects: a case no line covers simply adds nothing, so gaps are not reported
  const collects = !first && !unique;

  // overlaps: every column has a common value
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    if (allAny(i) || allAny(j) || grouped(i) || grouped(j)) continue;
    const common: (Cond | null | undefined)[] = cols.map((_, c) => meet(grid[i][c], grid[j][c]));
    if (common.some(c => c === null || c === undefined)) continue;
    const where = common.map((c, k) => (c as Cond).k === 'any' ? '' : `${label(cols[k].name)} ${rangeText(c as Cond, n => fmt(cols[k].name, n))}`).filter(Boolean).join(' and ');
    const same = JSON.stringify(rows[i].inputs) === JSON.stringify(rows[j].inputs);
    out.push({ kind: 'overlap', rows: [i + 1, j + 1], text: same
      ? `Lines ${i + 1} and ${j + 1} have the same conditions`
      : `Lines ${i + 1} and ${j + 1} both match ${where ? 'when ' + where : 'every case'}${first ? ' · the first one is used' : unique ? ' · only one may match' : ''}` });
  }

  // gaps: only when every row constrains the same one column (others any) — then the union on that column is exact
  if (collects || rows.some((_, r) => allAny(r) || grouped(r))) return out;
  const used = new Set<number>(); let readable = true;
  grid.forEach(r => r.forEach((c, k) => { if (c.k !== 'any') used.add(k); if (c.k === '?') readable = false; }));
  if (!readable || used.size !== 1) return out;
  const k = Array.from(used)[0]; const name = cols[k].name;
  const conds = grid.map(r => r[k]);
  const nums = conds.filter((c): c is Num => c.k === 'num');
  const onlyNum = conds.every(c => c.k === 'num' || c.k === 'null');
  if (onlyNum && nums.length) {
    const s = [...nums].sort((a, b) => a.lo - b.lo || (a.loIn === b.loIn ? 0 : a.loIn ? -1 : 1));
    let lo = -INF, loIn = false; // uncovered starts at (-inf
    const gaps: Num[] = [];
    let curHi = -INF, curHiIn = false, started = false;
    for (const iv of s) {
      if (!started) {
        if (iv.lo > -INF || (iv.lo === -INF && false)) gaps.push({ k: 'num', lo: -INF, loIn: false, hi: iv.lo, hiIn: !iv.loIn });
        curHi = iv.hi; curHiIn = iv.hiIn; started = true; continue;
      }
      const touches = iv.lo < curHi || (iv.lo === curHi && (iv.loIn || curHiIn));
      if (!touches) gaps.push({ k: 'num', lo: curHi, loIn: !curHiIn, hi: iv.lo, hiIn: !iv.loIn });
      if (iv.hi > curHi || (iv.hi === curHi && iv.hiIn)) { curHi = iv.hi; curHiIn = iv.hiIn; }
    }
    if (curHi < INF) gaps.push({ k: 'num', lo: curHi, loIn: !curHiIn, hi: INF, hiIn: false });
    void lo; void loIn;
    for (const g of gaps) out.push({ kind: 'gap', rows: [], text: `No line covers ${label(name)} ${rangeText(g, n => fmt(name, n))}` });
  }
  if (!conds.some(c => c.k === 'null' && !c.neg)) out.push({ kind: 'gap', rows: [], text: `No line covers ${label(name)} not given` });
  return out;
}
