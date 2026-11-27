import { nameToWords } from './terms';
// Read field paths from a sample (JSON / xlsx / csv) and propose terms: nested keys joined with dots, lists kept as [] (a[].b[].c),
// type inferred from the sample values, name humanised from the last path segment.
export type Proposed = { path: string; term: string; type: string; values: string[]; samples: string[]; keep: boolean };

const DATE = /^\d{4}-\d{2}-\d{2}([T ][\d:.]+Z?)?$|^\d{1,2}\/\d{1,2}\/\d{2,4}$/;

export function humanise(path: string): string {
  const last = path.split('.').filter(s => !/^\d+$/.test(s) && s !== '[]').pop()?.replace(/\[\]$/, '') || path;
  return nameToWords(last) || last;
}

const YMD = (s: string) => { const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s); if (!m) return false; const y = +m[1], mo = +m[2], d = +m[3]; return y >= 1900 && y <= 2200 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31; };

function infer(vals: any[]): { type: string; values: string[] } {
  const v = vals.filter(x => x !== null && x !== undefined && String(x).trim() !== '');
  if (!v.length) return { type: 'text', values: [] };
  if (v.every(x => typeof x === 'boolean' || /^(true|false)$/i.test(String(x)))) return { type: 'boolean', values: [] };
  // dates before numbers: 20210615 is a date (yyyymmdd), not a number
  if (v.every(x => x instanceof Date || DATE.test(String(x).trim()) || YMD(String(x).trim()))) return { type: 'date', values: [] };
  if (v.every(x => typeof x === 'number' || /^-?[\d,]*\.?\d+$/.test(String(x).trim()))) return { type: 'number', values: [] };
  const distinct = Array.from(new Set(v.map(x => String(x).trim()))).sort();
  // many rows: every distinct value up to 30 is the list of allowed values; above that it is text
  if (v.length >= 5) return distinct.length <= 30 && distinct.every(s => s.length <= 40) ? { type: 'enum', values: distinct } : { type: 'text', values: [] };
  // one or a few samples: a few short words read as a list of values (more can be typed or added on the word)
  if (distinct.length <= 5 && distinct.every(s => s.length <= 40)) return { type: 'enum', values: distinct };
  return { type: 'text', values: [] };
}

function collect(rows: Record<string, any>[]): Map<string, any[]> {
  const m = new Map<string, any[]>();
  const walk = (o: any, pre: string) => {
    if (Array.isArray(o)) {
      if (o.length && o.every(x => x === null || typeof x !== 'object')) { (m.get(pre) || m.set(pre, []).get(pre)!).push(...o); return; }
      o.slice(0, 50).forEach(x => walk(x, pre ? `${pre}[]` : '[]')); return;
    }
    if (o instanceof Date) { (m.get(pre) || m.set(pre, []).get(pre)!).push(o); return; }
    if (o && typeof o === 'object') { for (const [k, v] of Object.entries(o)) walk(v, pre ? `${pre}.${k}` : k); return; }
    if (pre) (m.get(pre) || m.set(pre, []).get(pre)!).push(o);
  };
  rows.forEach(r => walk(r, ''));
  return m;
}

export function propose(rows: Record<string, any>[], known: { path: string; term: string }[]): Proposed[] {
  const have = new Set(known.map(k => k.path)); const names = new Set(known.map(k => k.term.toLowerCase()));
  const out: Proposed[] = [];
  const found = collect(rows);
  // every list on the way to a field is a word too (bureau_accounts[], bureau_accounts[].payments[])
  const lists = new Set<string>();
  found.forEach((_, p) => { const parts = p.split('.'); parts.forEach((seg, i) => { if (seg.endsWith('[]') && !p.startsWith('items[]')) lists.add(parts.slice(0, i + 1).join('.')); }); });
  lists.forEach(l => { if (!found.has(l)) found.set(l, []); });
  found.forEach((vals, rawPath) => {
    // lines of input.items are read per line as item.* (as the rule sentences do); other lists keep their structure
    const path = rawPath.replace(/^items\[\]\./, 'item.').replace(/\.\./g, '.').replace(/^\./, '');
    if (!path || out.some(o => o.path === path)) return;
    const { type, values } = lists.has(rawPath) ? { type: 'list', values: [] as string[] } : infer(vals);
    const existing = known.find(k => k.path === path);
    let term = existing?.term || humanise(path); let i = 2; const base = term;
    if (!existing) { while (names.has(term.toLowerCase())) term = `${base} ${i++}`; names.add(term.toLowerCase()); }
    out.push({ path: path.replace(/\s+/g, '_'), term, type, values, samples: Array.from(new Set(vals.map(v => v instanceof Date ? v.toISOString().slice(0, 10) : String(v)))).slice(0, 3), keep: !have.has(path) });
  });
  return out;
}

function csvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  const first = text.split('\n')[0]; const n = (re: RegExp) => first.match(re)?.length || 0;
  const sep = n(/\t/g) ? '\t' : n(/;/g) > n(/,/g) ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
    if (c === '"') q = true; else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}

/** Header row = field paths (dots allowed), later rows = sample values. */
function tableToRows(table: any[][]): Record<string, any>[] {
  const head = (table[0] || []).map(h => String(h ?? '').trim());
  return table.slice(1, 501).map(r => { const o: Record<string, any> = {}; head.forEach((h, i) => { if (h) o[h] = r[i]; }); return o; });
}

/** Rows read from a dropped file or pasted JSON. Flat keys with dots stay as paths. */
export async function readSample(input: File | string): Promise<Record<string, any>[]> {
  if (typeof input !== 'string' && !(input instanceof File)) { const j: any = input; return Array.isArray(j) ? j : [j]; }
  if (typeof input === 'string') { const j = JSON.parse(input); return Array.isArray(j) ? j : [j]; }
  const name = input.name.toLowerCase();
  if (name.endsWith('.json')) { const j = JSON.parse(await input.text()); return Array.isArray(j) ? j : [j]; }
  if (name.endsWith('.csv') || name.endsWith('.txt')) return tableToRows(csvRows(await input.text()));
  if (name.endsWith('.xlsx')) return tableToRows(await readTable(input));
  throw new Error('Drop a .json, .xlsx or .csv file');
}

/** A table (rows of cells) from a dropped .xlsx / .csv or pasted rows (tab, comma or semicolon separated).
 *  In a workbook the sheet whose first row names `prefer` is taken, else the first sheet. */
export async function readTable(input: File | string, prefer?: RegExp): Promise<any[][]> {
  if (typeof input === 'string') return csvRows(input.replace(/\r?\n$/, ''));
  const name = input.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt') || name.endsWith('.tsv')) return csvRows(await input.text());
  if (!name.endsWith('.xlsx')) throw new Error('Drop an .xlsx or .csv file');
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await input.arrayBuffer());
  const read = (ws: any) => { const table: any[][] = []; ws.eachRow({ includeEmpty: false }, (row: any) => { const r: any[] = []; row.eachCell({ includeEmpty: true }, (c: any, i: number) => { const v: any = c.value; r[i - 1] = v && typeof v === 'object' && !(v instanceof Date) ? (v.result ?? v.text ?? c.text) : v; }); table.push(r); }); return table; };
  const sheets = wb.worksheets.map(read); if (!sheets.length) throw new Error('The file has no sheet');
  return (prefer && sheets.find(t => (t[0] || []).some(h => prefer.test(String(h ?? ''))))) || sheets[0];
}
