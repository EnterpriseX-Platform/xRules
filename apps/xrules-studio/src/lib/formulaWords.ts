// A calculation formula read in plain words: word names instead of data paths, × ÷ ≥ ≤, "x * 1" dropped,
// IF(a, b, c) as "if a / then b / else c" on lines of their own. Quoted text is kept as it is.
const FN: Record<string, string> = {
  SUM: 'sum of', AVG: 'average of', AVERAGE: 'average of', MIN: 'lowest of', MAX: 'highest of', COUNT: 'count of', ROUND: 'round', ROUNDDOWN: 'round down', ROUNDUP: 'round up',
  OR: 'any of', AND: 'all of', NOT: 'not', DAYS: 'days since', MONTHS: 'months since', YEARS: 'years since', TODAY: 'today', ITEM: 'item', SPLIT: 'split', CONTAINS: 'contains',
  LEFT: 'left', RIGHT: 'right', MID: 'middle', LEN: 'length of', UPPER: 'upper', LOWER: 'lower', TRIM: 'trim', STARTSWITH: 'starts with', ENDSWITH: 'ends with',
  COUNT_PAIRS: 'count pairs', ANY_PAIR: 'any pair', ZIP: 'pair lists', ADD_DAYS: 'add days', DATE: 'date', TEXT: 'text',
};
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const outside = (s: string, fn: (x: string) => string) => s.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/).map((p, i) => (i % 2 ? p : fn(p))).join('');

/** One expression in words, on one line (IFs stay inline as "if … then … else …"). */
export function wordsInline(expr: string, label: (p: string) => string, paths: string[] = []): string {
  const known = Array.from(new Set(paths.filter(p => p && /[^\w]/.test(p)))).sort((a, b) => b.length - a.length);
  return outside(String(expr ?? '').replace(/(?<![=!<>])==?(?![=])/g, ' = '), part => {
    let out = part;
    known.forEach(p => { out = out.replace(new RegExp(`(?<![\\w.])${esc(p)}(?![\\w])`, 'g'), `⟦${label(p)}⟧`); });
    out = out.split(/(⟦[^⟧]*⟧)/).map((x, i) => (i % 2 ? x : x
      .replace(/([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*)(\s*\()?/g, (m, id: string, call?: string) => {
        if (call) { const f = FN[id.toUpperCase()]; return f ? `${f} (` : m; }
        if (/^(true|false|null)$/i.test(id) || /^(and|or|not|if|then|else)$/i.test(id)) return id.toLowerCase();
        return label(id);
      }))).join('');
    return out.replace(/⟦|⟧/g, '')
      .replace(/\s*\*\s*1(?![\d.])/g, '').replace(/\s*\*\s*/g, ' × ').replace(/\s*\/\s*/g, ' ÷ ')
      .replace(/\s*>=\s*/g, ' ≥ ').replace(/\s*<=\s*/g, ' ≤ ').replace(/\s*!=\s*/g, ' ≠ ').replace(/\s*==\s*/g, ' = ').replace(/\s+/g, ' ');
  }).replace(/\s+/g, ' ').trim();
}

/** The formula as lines: IF(a, b, c) (any depth) becomes if / then / else lines, each with its indent. */
export function formulaLines(expr: string, label: (p: string) => string, paths: string[] = []): { indent: number; text: string }[] {
  const out: { indent: number; text: string }[] = [];
  const walk = (src: string, depth: number, lead = '') => {
    const s = src.trim(); const m = s.match(/^if\s*\(/i);
    if (m) {
      // split the IF's own parts at the commas outside brackets and quotes
      let d = 0, q = '', start = m[0].length; const parts: string[] = []; let end = -1;
      for (let i = start; i < s.length; i++) {
        const c = s[i];
        if (q) { if (c === q && s[i - 1] !== '\\') q = ''; continue; }
        if (c === '"' || c === "'") { q = c; continue; }
        if (c === '(') d++; else if (c === ')') { if (d === 0) { parts.push(s.slice(start, i)); end = i; break; } d--; }
        else if (c === ',' && d === 0) { parts.push(s.slice(start, i)); start = i + 1; }
      }
      if (end === s.length - 1 && parts.length === 3) {
        out.push({ indent: depth, text: `${lead}if ${wordsInline(parts[0], label, paths)}` });
        walk(parts[1], depth + 1, 'then ');
        walk(parts[2], depth + 1, 'else ');
        return;
      }
    }
    out.push({ indent: depth, text: `${lead}${wordsInline(s, label, paths)}` });
  };
  walk(String(expr ?? ''), 0);
  return out;
}
