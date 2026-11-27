// Formulas in business words, turned into a JavaScript expression the sandbox can run.
// Handles: quoted text kept as is ("1: CreditCard"), data paths with dots and spaces (Application.Call Type),
// "if … then … else …" (nestable, "else if"), IF(c, a, b), and / or / not, = as a comparison, × ÷ − ≥ ≤ ≠ <>.
// Every word becomes __get("path"), so a missing word is undefined rather than a syntax error.

const KEEP = new Set(['true', 'false', 'null', 'undefined', 'Math', 'NaN', 'Infinity']);

/** Every dotted path in an object (lists are leaves), longest first is up to the caller. */
export function pathsOf(o: any, p = '', out: string[] = [], depth = 0): string[] {
  if (!o || typeof o !== 'object' || Array.isArray(o) || depth > 6) return out;
  for (const [k, v] of Object.entries(o)) {
    const q = p ? `${p}.${k}` : k; out.push(q);
    if (v && typeof v === 'object' && !Array.isArray(v)) pathsOf(v, q, out, depth + 1);
  }
  return out;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function ifThenElse(text: string): string {
  const toks = text.split(/(\bif\b|\bthen\b|\belse\b|[()])/i).filter(t => t !== '');
  let pos = 0;
  const low = (i: number) => String(toks[i] ?? '').toLowerCase();
  const thenAhead = (from: number) => {
    let d = 0;
    for (let i = from + 1; i < toks.length; i++) {
      if (toks[i] === '(') d++; else if (toks[i] === ')') { if (--d < 0) return false; } else if (d === 0 && low(i) === 'then') return true;
    }
    return false;
  };
  const parse = (stops: Set<string>): string => {
    let out = '';
    while (pos < toks.length) {
      const t = toks[pos]; const lt = t.toLowerCase();
      if (stops.has(lt) || t === ')') return out;
      if (t === '(') { pos++; out += '(' + parse(new Set()); if (toks[pos] === ')') { out += ')'; pos++; } continue; }
      if (lt === 'if' && thenAhead(pos)) {
        pos++; const c = parse(new Set(['then'])); pos++;
        const a = parse(new Set(['else', ...Array.from(stops)]));
        let b = 'null'; if (low(pos) === 'else') { pos++; b = parse(stops); }
        out += `((${c.trim()}) ? (${a.trim()}) : (${b.trim()}))`; continue;
      }
      out += t; pos++;
    }
    return out;
  };
  let out = parse(new Set());
  while (pos < toks.length) { out += toks[pos++]; } // stray ")" stays, the sandbox reports it
  return out;
}

/** Reasons raised by earlier steps of the run: "has reason M005", "has a Reject reason" / "has reason of outcome Reject",
 *  "no Reject reason", HAS_REASON("M005", "E002") and HAS_OUTCOME("Reject"). They read the run's "reasons so far" and
 *  "outcomes so far" lists. Quoted text is left alone. */
export function reasonWords(src: string): string {
  const R = '__get("reasons so far")', O = '__get("outcomes so far")';
  return src.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/).map((part, i) => (i % 2 ? part : part
    .replace(/\bno\s+(?:reason\s+of\s+outcome\s+)?([A-Za-z]+)\s+reasons?\b/gi, (_m, o) => `!HAS_OUTCOME(${JSON.stringify(o)})`)
    .replace(/\bno\s+reason\s+of\s+outcome\s+([A-Za-z]+)/gi, (_m, o) => `!HAS_OUTCOME(${JSON.stringify(o)})`)
    .replace(/\bhas\s+(?:a\s+|any\s+)?reason\s+of\s+outcome\s+([A-Za-z]+)/gi, (_m, o) => `HAS_OUTCOME(${JSON.stringify(o)})`)
    .replace(/\bhas\s+(?:a\s+|any\s+)?(?!reason\b)([A-Za-z]+)\s+reasons?\b/gi, (_m, o) => `HAS_OUTCOME(${JSON.stringify(o)})`)
    .replace(/\bhas\s+reasons?\s+([A-Za-z]+\d\w*(?:\s*(?:,|\bor\b)\s*[A-Za-z]+\d\w*)*)/gi, (_m, cs) => `HAS_REASON(${cs.split(/\s*(?:,|\bor\b)\s*/i).filter(Boolean).map((c: string) => JSON.stringify(c)).join(', ')})`)
    .replace(/\bHAS_REASON\s*\(/gi, `__has(${R}, `)
    .replace(/\bHAS_OUTCOME\s*\(/gi, `__has(${O}, `))).join('');
}

/** Business formula → JavaScript. `paths` are the known words (data paths), `funcs` the function names. */
export function compileExpr(src: string, paths: string[] = [], funcs: string[] = []): string {
  const strs: string[] = []; const ps: string[] = [];
  let s = reasonWords(String(src ?? ''))
    .replace(/“([^”]*)”/g, (_m, x) => JSON.stringify(x))
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, m => { strs.push(m[0] === '"' ? m : JSON.stringify(m.slice(1, -1))); return `\u0001${strs.length - 1}\u0001`; });
  // known words that are not plain identifiers (dots, spaces, dashes) — longest first
  const known = Array.from(new Set(paths.filter(p => p && /[^\w$]/.test(p)))).sort((a, b) => b.length - a.length);
  for (const p of known) {
    const re = new RegExp(`(?<![\\w.$])${esc(p)}(?![\\w$])`, 'g');
    s = s.replace(re, () => { ps.push(p); return `\u0002${ps.length - 1}\u0002`; });
  }
  s = s.replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/≠|<>/g, '!=');
  s = ifThenElse(s);
  // OR( … ) / AND( … ) at the start of a value are functions; "a or (b)" between two values is the operator
  const asCall = (m: string, off: number, all: string) => /^\s*\(/.test(all.slice(off + m.length)) && /(^|[(,?:!&|=<>+\-*/])\s*$/.test(all.slice(0, off));
  s = s.replace(/\band\b/gi, (m, off, all) => (asCall(m, off, all) ? 'AND' : '&&')).replace(/\bor\b/gi, (m, off, all) => (asCall(m, off, all) ? 'OR' : '||')).replace(/\bnot\b(?!\s*\()/gi, '!');
  s = s.replace(/(^|[^=!<>])=(?!=)/g, '$1==');
  const fn = new Set(funcs.map(f => f.toUpperCase()));
  s = s.replace(/(?<![\w.$\u0001\u0002])([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)(?![\w$])(\s*\()?/g, (m, id: string, call?: string) => {
    if (call) return fn.has(id.toUpperCase()) && !id.startsWith("__") && !/^[A-Z_]+$/.test(id) ? id.toUpperCase() + call : m;
    if (KEEP.has(id) || id.startsWith('Math.') || id === '__get' || id === '__has') return m;
    return `__get(${JSON.stringify(id)})`;
  });
  return s.replace(/\u0002(\d+)\u0002/g, (_m, i) => `__get(${JSON.stringify(ps[+i])})`).replace(/\u0001(\d+)\u0001/g, (_m, i) => strs[+i]);
}

/** Read a word: a flat key ("Application.Call Type") or a path through nested objects. */
export function getter(scope: any) {
  return (p: string) => {
    if (scope && typeof scope === 'object' && p in scope) return scope[p];
    return String(p).split('.').reduce((a: any, k) => (a == null ? undefined : a[k]), scope);
  };
}

const toNum = (x: any) => (typeof x === 'number' ? x : x === '' || x == null || typeof x === 'boolean' ? NaN : Number(String(x).replace(/,/g, '').trim()));
const NUMERIC = new Set(['number', 'money', 'integer', 'decimal', 'percent']);
const PLAIN_NUMBER = /^-?(?:0|[1-9]\d{0,2}(?:,\d{3})+|[1-9]\d*)(?:\.\d+)?$|^-?0?\.\d+$/;
/** A word's value as the formula should see it: numbers typed in test cases and imports come in as text.
 *  Number words become numbers (blank = 0); words of unknown type become numbers only when they plainly are one
 *  (no leading zero, so codes like "001" stay text); text words stay text. */
export function asWordValue(v: any, type?: string): any {
  if (type && NUMERIC.has(type)) { if (v == null || v === '') return 0; if (typeof v === 'string') { const n = toNum(v); return isNaN(n) ? v : n; } return v; }
  if ((type && type !== 'text') || typeof v !== 'string') return v;
  const t = v.trim(); return PLAIN_NUMBER.test(t) ? Number(t.replace(/,/g, '')) : v;
}
