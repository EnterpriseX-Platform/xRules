// Decision tables whose lines use "or" groups or raise reason codes are evaluated here, in the API.
// A line: { inputs: [cell per column], match?: 'all'|'any', or?: [{ match?, when: { column: cell } }], reasons?: [code] }
// The line matches when any of its groups matches; a group matches all (or any) of its non-blank cells.
// The same cell language as the table: "-", "= x", "!= x", "< n", "<= n", "> n", ">= n", "BTW a AND b",
// "BTW LO/RO", "!BTW", "IN a,b", "!IN a,b", "null", "!null"/"not null", or a bare value (equals).

type Group = { match?: string; cells: { name: string; cell: any }[] };
type Reason = { code: string; text: string; outcome: string; priority: number };

const blank = (c: any) => c === null || c === undefined || (typeof c === 'string' && ['', '-', 'any'].includes(c.trim().toLowerCase()));
export const isElseCell = (c: any) => typeof c === 'string' && ['else', '_else_'].includes(c.trim().toLowerCase());
const get = (o: any, path: string) => (path in (o || {}) ? o[path] : String(path).split('.').reduce((a, k) => (a == null ? undefined : a[k]), o));
const num = (v: any) => (v === '' || v === null || v === undefined ? NaN : Number(String(v).replace(/,/g, '')));
const unq = (s: string) => s.trim().replace(/^["']|["']$/g, '');
const list = (s: string) => String(s ?? '').replace(/^\[|\]$/g, '').split(',').map(unq).filter(x => x !== '');
const same = (a: any, b: string) => { const n = num(b); return typeof a === 'number' || (!isNaN(n) && !isNaN(num(a)) && typeof a !== 'boolean') ? num(a) === n : String(a) === unq(b); };

export function matchCell(cell: any, actual: any): boolean {
  if (blank(cell) || isElseCell(cell)) return true;
  if (typeof cell !== 'string') return actual === cell || String(actual) === String(cell);
  const s = cell.trim(); const u = s.toUpperCase();
  const empty = actual === undefined || actual === null || actual === '';
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
    case '=': return same(actual, arg);
    case '!=': return !same(actual, arg);
    case 'IN': return list(arg).some(x => same(actual, x));
    case '!IN': return !list(arg).some(x => same(actual, x));
    default: {
      const v = num(actual), a = num(arg); if (isNaN(v) || isNaN(a)) return false;
      return op === '>' ? v > a : op === '>=' ? v >= a : op === '<' ? v < a : v <= a;
    }
  }
}

export function groupsOf(def: any, row: any): Group[] {
  const cols: any[] = def?.inputs || [];
  const main: Group = { match: row?.match, cells: cols.map((c, i) => ({ name: c.name, cell: row?.inputs?.[i] })).filter(x => !blank(x.cell) && !isElseCell(x.cell)) };
  const extra: Group[] = (Array.isArray(row?.or) ? row.or : []).map((g: any) => ({ match: g?.match, cells: Object.entries(g?.when || {}).map(([name, cell]) => ({ name, cell })).filter(x => !blank(x.cell)) }));
  return [main, ...extra].filter(g => g.cells.length);
}

export function rowMatches(def: any, row: any, input: any): boolean {
  const gs = groupsOf(def, row);
  if (!gs.length) return true;
  return gs.some(g => g.match === 'any' ? g.cells.some(c => matchCell(c.cell, get(input, c.name))) : g.cells.every(c => matchCell(c.cell, get(input, c.name))));
}

export const usesGroupsOrReasons = (def: any) => (def?.rules || []).some((r: any) => (Array.isArray(r?.or) && r.or.length) || r?.match === 'any' || (Array.isArray(r?.reasons) && r.reasons.length));
export const usesReasons = (def: any) => (def?.rules || []).some((r: any) => Array.isArray(r?.reasons) && r.reasons.length);

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
  const outs: string[] = (def?.outputs || []).map((o: any) => o.name);
  const policy = String(def?.hitPolicy || 'STANDARD').toUpperCase();
  const first = policy === 'FIRST' || policy === 'FIRST_MATCH' || policy === 'UNIQUE' || policy === 'ANY';
  const rows: any[] = def?.rules || [];
  const elseRow = rows.find(r => Array.isArray(r?.inputs) && r.inputs.some(isElseCell));
  const value = (r: any) => Object.fromEntries(outs.map((n, i) => [n, r?.outputs?.[i] ?? null]));
  const hits: any[] = []; const all: any[] = [];
  for (const r of rows) {
    if (r === elseRow) continue;
    const ok = rowMatches(def, r, input);
    if (policy === 'EVALUATE_ALL') all.push({ _match: ok, ...value(r) });
    if (ok) { hits.push(r); if (first) break; }
  }
  if (!hits.length && elseRow) hits.push(elseRow);
  let result: any;
  if (policy === 'EVALUATE_ALL') result = all;
  else if (first) result = hits[0] ? value(hits[0]) : null;
  else if (policy === 'ARRAY') { const cols: Record<string, unknown[]> = {}; for (const h of hits) for (const [k, v] of Object.entries(value(h))) (cols[k] ||= []).push(v); result = cols; }
  else result = hits.map(value);
  if (!usesReasons(def)) return result;

  // reasons: every code the matching lines raise, the top one by priority, and its outcome
  const codes = Array.from(new Set(hits.flatMap(h => (Array.isArray(h.reasons) ? h.reasons : []).map(String))));
  const known = codes.map(c => catalogue.find(x => x.code === c) || { code: c, text: c, outcome: 'Decline', priority: Number.MAX_SAFE_INTEGER });
  const top = [...known].sort((a, b) => a.priority - b.priority)[0];
  const reasons = { reasons: codes, reason: top?.code ?? null, reasonText: top?.text ?? null, outcome: top?.outcome ?? 'Approve' };
  if (!outs.length) return reasons;
  if (result && typeof result === 'object' && !Array.isArray(result)) return { ...result, ...reasons };
  return { lines: result, ...reasons };
}
