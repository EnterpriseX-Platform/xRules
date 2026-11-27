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

/** Business formula → JavaScript. `paths` are the known words (data paths), `funcs` the function names. */
export function compileExpr(src: string, paths: string[] = [], funcs: string[] = []): string {
  const strs: string[] = []; const ps: string[] = [];
  let s = String(src ?? '')
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
  s = s.replace(/\band\b/gi, '&&').replace(/\bor\b/gi, '||').replace(/\bnot\b(?!\s*\()/gi, '!');
  s = s.replace(/(^|[^=!<>])=(?!=)/g, '$1==');
  const fn = new Set(funcs.map(f => f.toUpperCase()));
  s = s.replace(/(?<![\w.$\u0001\u0002])([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)(?![\w$])(\s*\()?/g, (m, id: string, call?: string) => {
    if (call) return fn.has(id.toUpperCase()) && !/^[A-Z_]+$/.test(id) ? id.toUpperCase() + call : m;
    if (KEEP.has(id) || id.startsWith('Math.') || id === '__get') return m;
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
