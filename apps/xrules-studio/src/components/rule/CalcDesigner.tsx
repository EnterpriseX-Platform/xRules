'use client';
// Calculations in business words: each line is "result = expression", built from vocabulary terms and a few
// functions. Results become terms other rules can use. A sample panel works the lines out as you type.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useTerms, showValue, type Term } from '@/lib/terms';
import { InputFields } from '@/components/test/FieldsEditor';
import { useQueryClient } from '@tanstack/react-query';
import { RequestData } from '@/components/topic/RequestData';
import { compileExpr, getter, pathsOf, asWordValue } from '@/lib/expr';
import { wordsInline } from '@/lib/formulaWords';

type Line = { name: string; expr: string; label?: string };
const FUNCS: { name: string; insert: string; label: string; help?: string }[] = [
  { name: 'SUM', insert: 'SUM(', label: 'Sum' }, { name: 'AVERAGE', insert: 'AVERAGE(', label: 'Average' }, { name: 'COUNT', insert: 'COUNT(', label: 'Count' },
  { name: 'MIN', insert: 'MIN(', label: 'Lowest' }, { name: 'MAX', insert: 'MAX(', label: 'Highest' }, { name: 'OR', insert: 'OR(', label: 'Any of' }, { name: 'AND', insert: 'AND(', label: 'All of' },
  { name: 'ROUND', insert: 'ROUND(', label: 'Round' }, { name: 'ROUNDDOWN', insert: 'ROUNDDOWN(', label: 'Round down' }, { name: 'IF', insert: 'IF(', label: 'If' },
  { name: 'TODAY', insert: 'TODAY()', label: 'Today' }, { name: 'DAYS', insert: 'DAYS(', label: 'Days since' }, { name: 'MONTHS', insert: 'MONTHS(', label: 'Months since' },
  { name: 'LEFT', insert: 'LEFT(', label: 'Left', help: 'LEFT(text, n): first n characters' }, { name: 'RIGHT', insert: 'RIGHT(', label: 'Right', help: 'RIGHT(text, n): last n characters' },
  { name: 'MID', insert: 'MID(', label: 'Middle', help: 'MID(text, start, n): n characters from position start (first is 1)' }, { name: 'LEN', insert: 'LEN(', label: 'Length', help: 'LEN(text): number of characters (of a list: number of items)' },
  { name: 'UPPER', insert: 'UPPER(', label: 'Upper', help: 'UPPER(text)' }, { name: 'LOWER', insert: 'LOWER(', label: 'Lower', help: 'LOWER(text)' }, { name: 'TRIM', insert: 'TRIM(', label: 'Trim', help: 'TRIM(text): no spaces at the ends, single spaces inside' },
  { name: 'STARTSWITH', insert: 'STARTSWITH(', label: 'Starts with', help: 'STARTSWITH(text, start): yes / no' },
  { name: 'SPLIT', insert: 'SPLIT(', label: 'Split list', help: 'SPLIT(text, ":"): a list; the separator is ":" unless given' }, { name: 'CONTAINS', insert: 'CONTAINS(', label: 'Contains', help: 'CONTAINS(list or text, value): a list (or text with ":" or ",") has the item, else the text has the part' },
  { name: 'ITEM', insert: 'ITEM(', label: 'Item no.', help: 'ITEM(list, n, ":"): item n of a list or of text split by ":" (or the separator given); -1 is the last' },
  { name: 'HAS_REASON', insert: 'has reason ', label: 'Has reason', help: 'has reason M005 · has a Reject reason · no Reject reason: reasons raised by earlier steps' },
  { name: 'ANY_PAIR', insert: 'ANY_PAIR(', label: 'Any pair' }, { name: 'COUNT_PAIRS', insert: 'COUNT_PAIRS(', label: 'Count pairs' }, { name: 'ZIP', insert: 'ZIP(', label: 'Pair lists' },
];
const OPS = ['+', '−', '×', '÷', '(', ')', '≥', '≤', '='];

const toN = (x: any) => (typeof x === 'number' ? x : x === '' || x == null || typeof x === 'boolean' ? NaN : Number(String(x).replace(/,/g, '').trim()));
const listOf = (a: any[]): any[] => (Array.isArray(a[0]) && a.length === 2 && typeof a[1] === 'string' && isNaN(toN(a[1])) ? a[0].map((x: any) => x?.[a[1]]) : a.flat(Infinity));
const nums = (a: any[]) => listOf(a).map(toN).filter((n: number) => !isNaN(n));
/** cmd+A / ctrl+A selects the whole box (the app's own shortcuts never take it from a text box). */
const selectAllKey = (e: React.KeyboardEvent<HTMLInputElement>) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); e.stopPropagation(); e.currentTarget.select(); return true; } return false; };
const txt = (v: any) => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10).replace(/-/g, '') : String(v));
const cnt = (n: any, d = 1) => { const x = Number(n); return n === undefined || n === null || n === '' || isNaN(x) ? d : Math.max(0, Math.floor(x)); };
// same functions the engine uses
const F: Record<string, any> = {
  SUM: (...a: any[]) => nums(a).reduce((t: number, n: number) => t + n, 0),
  AVG: (...a: any[]) => { const xs = nums(a); return xs.length ? xs.reduce((t: number, n: number) => t + n, 0) / xs.length : 0; },
  COUNT: (...a: any[]) => (a.length === 1 ? (Array.isArray(a[0]) ? a[0].length : a[0] == null || a[0] === '' ? 0 : 1) : listOf(a).filter((x: any) => x != null && x !== '').length),
  MIN: (...a: any[]) => { const xs = nums(a); return xs.length ? Math.min(...xs) : 0; },
  MAX: (...a: any[]) => { const xs = nums(a); return xs.length ? Math.max(...xs) : 0; },
  ROUND: (x: any, d = 0) => { const f = Math.pow(10, d); return Math.round((toN(x) || 0) * f) / f; },
  ROUNDDOWN: (x: any, d = 0) => { const f = Math.pow(10, d); return Math.floor((toN(x) || 0) * f) / f; },
  ROUNDUP: (x: any, d = 0) => { const f = Math.pow(10, d); return Math.ceil((toN(x) || 0) * f) / f; },
  OR: (...a: any[]) => a.some(Boolean), AND: (...a: any[]) => a.every(Boolean), NOT: (x: any) => !x,
  IF: (c: any, a: any, b: any) => (c ? a : b),
  TODAY: () => { const n = new Date(); return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())); },
  DATE: (v: any) => toDate(v),
  DAYS: (a: any, b?: any) => { const x = toDate(a), y = b === undefined ? F.TODAY() : toDate(b); return x && y ? Math.round((y.getTime() - x.getTime()) / 86400000) : null; },
  MONTHS: (a: any, b?: any) => { const x = toDate(a), y = b === undefined ? F.TODAY() : toDate(b); return x && y ? (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + (y.getUTCMonth() - x.getUTCMonth()) - (y.getUTCDate() < x.getUTCDate() ? 1 : 0) : null; },
  YEARS: (a: any, b?: any) => { const m = F.MONTHS(a, b); return m === null ? null : Math.floor(m / 12); },
  ADD_DAYS: (a: any, n: any) => { const x = toDate(a); return x ? new Date(x.getTime() + Number(n) * 86400000) : null; },
  SPLIT: (v: any, sep: any = ':') => (Array.isArray(v) ? v : txt(v).split(txt(sep) || ':').map((x: string) => x.trim()).filter((x: string) => x !== '')),
  CONTAINS: (list: any, v: any) => (Array.isArray(list) ? list.map((x: any) => txt(x).trim()).includes(txt(v).trim()) : /[:,]/.test(txt(list)) ? txt(list).split(/[:,]/).map((x: string) => x.trim()).includes(txt(v).trim()) : txt(list).includes(txt(v))),
  ITEM: (list: any, i: any, sep: any = ':') => { const xs = Array.isArray(list) ? list : txt(list).split(txt(sep) || ':').map((x: string) => x.trim()); const k = Number(i); return !isNaN(k) && k >= 1 ? xs[k - 1] ?? null : k < 0 ? xs[xs.length + k] ?? null : null; },
  LEFT: (t: any, n?: any) => txt(t).slice(0, cnt(n)), RIGHT: (t: any, n?: any) => { const x = txt(t), k = cnt(n); return k ? x.slice(-k) : ''; },
  MID: (t: any, a: any, n?: any) => { const x = txt(t), b = Math.max(1, cnt(a)); return n === undefined ? x.slice(b - 1) : x.slice(b - 1, b - 1 + cnt(n, 0)); },
  LEN: (t: any) => (Array.isArray(t) ? t.length : txt(t).length), UPPER: (t: any) => txt(t).toUpperCase(), LOWER: (t: any) => txt(t).toLowerCase(),
  TRIM: (t: any) => txt(t).trim().replace(/\s+/g, ' '), STARTSWITH: (t: any, p: any) => txt(t).startsWith(txt(p)), ENDSWITH: (t: any, p: any) => txt(t).endsWith(txt(p)),
  __has: (list: any, ...xs: any[]) => { const have = (Array.isArray(list) ? list : []).map((x: any) => txt(x).trim().toLowerCase()); return xs.flat().some((x: any) => have.includes(txt(x).trim().toLowerCase())); },
  ZIP: (a: any, b: any, na = 'code', nb = 'date') => { const x = asList(a), y = asList(b); return x.map((v: any, i: number) => ({ [na]: v, [nb]: y[i] ?? null })); },
  ANY_PAIR: (c: any, d: any, w: any, n?: any) => pairHits(c, d, w, n) > 0,
  COUNT_PAIRS: (c: any, d: any, w: any, n?: any) => pairHits(c, d, w, n),
};
Object.assign(F, { AVERAGE: F.AVG, LOWEST: F.MIN, HIGHEST: F.MAX, MINIMUM: F.MIN, MAXIMUM: F.MAX });
const asList = (v: any): any[] => (Array.isArray(v) ? v : String(v ?? '').split(':').map((s: string) => s.trim()).filter((s: string) => s !== ''));
function pairHits(codes: any, dates: any, which: any, days?: any): number {
  const cs = asList(codes), ds = asList(dates); const win = new Map<string, number | null>();
  (Array.isArray(which) ? which : String(which ?? '').split(/[,\s]+/)).map(String).filter(Boolean).forEach((w: string) => { const [c, d] = w.split('='); win.set(c.trim(), d !== undefined ? Number(d) : days === undefined || days === '' ? null : Number(days)); });
  let n = 0;
  cs.forEach((c: any, i: number) => { const k = String(c).trim(); if (win.size && !win.has(k)) return; const lim = win.size ? win.get(k) : days === undefined ? null : Number(days);
    if (lim === null || lim === undefined || isNaN(lim)) { n++; return; } const ago = F.DAYS(ds[i]); if (ago !== null && ago >= 0 && ago <= lim) n++; });
  return n;
}
function toDate(v: any): Date | null {
  if (v instanceof Date) return v; if (v === null || v === undefined || v === '') return null;
  const m = String(v).trim().match(/^(\d{4})-?(\d{2})-?(\d{2})/); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}
const getPath = (o: any, p: string) => (p in (o || {}) ? o[p] : p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o));
function nest(flat: Record<string, any>) {
  const o: any = {};
  Object.entries(flat).forEach(([k, v]) => { const ks = k.split('.'); let c = o; ks.slice(0, -1).forEach(x => { c[x] = c[x] && typeof c[x] === 'object' ? c[x] : {}; c = c[x]; }); c[ks[ks.length - 1]] = v; });
  return o;
}
const js = (e: string) => e.replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/≠/g, '!=').replace(/(^|[^=!<>])=(?!=)/g, '$1==');
// the same formula language as the API: if … then … else, quoted text, words with dots and spaces
function evaluate(expr: string, scope: Record<string, any>, words: string[] = []) {
  const code = compileExpr(expr, [...words, ...pathsOf(scope)], Object.keys(F));
  // eslint-disable-next-line no-new-func
  const get = getter(scope);
  return new Function('__get', 'Math', ...Object.keys(F), `"use strict"; return (${code});`)((p: string) => asWordValue(get(p)), Math, ...Object.values(F));
}
/** Replace outside quoted text only. */
const outsideQuotes = (s: string, fn: (x: string) => string) => s.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/).map((p, i) => (i % 2 ? p : fn(p))).join('');

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function toLabels(expr: string, terms: Term[]) {
  return outsideQuotes(expr, part => {
    let out = part;
    [...terms].filter(t => t.path && t.term).sort((a, b) => b.path.length - a.path.length).forEach(t => { if (t.term !== t.path) out = out.replace(new RegExp(`(?<![\\w.])${esc(t.path)}(?![\\w])`, 'g'), `⟦${t.term}⟧`); });
    return out.replace(/⟦|⟧/g, '').replace(/\s*\*\s*/g, ' × ').replace(/\s*\/\s*/g, ' ÷ ').replace(/\s*>=\s*/g, ' ≥ ').replace(/\s*<=\s*/g, ' ≤ ');
  });
}
function toPaths(text: string, terms: Term[]) {
  return outsideQuotes(text, part => {
    let out = part;
    [...terms].filter(t => t.path && t.term).sort((a, b) => b.term.length - a.term.length).forEach(t => { if (t.term !== t.path) out = out.replace(new RegExp(`(?<![\\w.])${esc(t.term)}(?![\\w])`, 'g'), `⟦${t.path}⟧`); });
    return out.replace(/⟦|⟧/g, '').replace(/−/g, '-');
  });
}
const slug = (s: string, i: number) => { const a = s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); return /^[a-z]/.test(a) ? a : `result_${i + 1}`; };

export function CalcDesigner({ rule, projectId, onChange }: { rule: any; projectId: string; onChange: (def: any) => void }) {
  const qc = useQueryClient();
  const [lines, setLines] = useState<Line[]>(() => (Array.isArray(rule.definition?.lines) && rule.definition.lines.length ? rule.definition.lines : [{ name: '', expr: '' }]));
  const { terms, label, term } = useTerms(projectId);
  const [focus, setFocus] = useState(0);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [sample, setSample] = useState<Record<string, any>>({});
  const latest = useRef(lines); latest.current = lines;
  const emit = (ls: Line[] | ((cur: Line[]) => Line[])) => { const next = typeof ls === 'function' ? ls(latest.current) : ls; latest.current = next; setLines(next); onChange({ ...(rule.definition || {}), lines: next }); };
  // what is typed in the focused formula box stays as typed; it is read into words when it is saved
  const [draft, setDraft] = useState<{ i: number; text: string } | null>(null);
  // a result name that is not a word yet is kept on the line right away (nothing typed is lost) and waits for
  // "Add word" before it becomes a project word, so text glued by mistake never becomes a word
  const isWord = (p: string) => terms.some(x => x.path === p);
  const nameOf = (l: Line) => (!l.name ? '' : isWord(l.name) ? label(l.name) : l.label || l.name);
  const resultRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusResult, setFocusResult] = useState<number | null>(null);
  useEffect(() => { if (focusResult === null) return; const el = resultRefs.current[focusResult]; if (el) { el.focus(); setFocusResult(null); } }, [focusResult, lines.length]);
  const addLine = () => { emit(ls => [...ls, { name: '', expr: '' }]); setFocusResult(latest.current.length - 1); };
  const produced = lines.map(l => l.name).filter(Boolean);
  const used = useMemo(() => {
    const set = new Set<string>();
    lines.forEach(l => (l.expr.match(/[A-Za-z_][\w.]*/g) || []).forEach(w => { const root = w.split('.')[0]; if (!F[root] && !produced.includes(w) && !produced.includes(root) && root !== 'true' && root !== 'false') set.add(w); }));
    return Array.from(set);
  }, [lines]); // eslint-disable-line react-hooks/exhaustive-deps

  function nameLine(i: number, text: string) {
    const t = text.trim(); if (!t) return;
    const cur = latest.current[i];
    if (cur?.name && (t === nameOf(cur) || t === cur.name)) return;
    const existing = terms.find(x => x.term.toLowerCase() === t.toLowerCase() || x.path === t);
    if (existing) { emit(ls => ls.map((l, j) => (j === i ? { name: existing.path, expr: l.expr } : l))); return; }
    // not a word yet: kept on the line under a name of its own
    const taken = (p: string) => terms.some(x => x.path === p) || latest.current.some((l, j) => j !== i && l.name === p);
    let path = slug(t, i); let n = 2; while (taken(path)) path = `${slug(t, i)}_${n++}`;
    emit(ls => ls.map((l, j) => (j === i ? { ...l, name: path, label: t } : l)));
  }
  async function addWord(i: number) {
    const l = latest.current[i]; if (!l?.name) return;
    await api.post('/platform/vocabulary', { projectId, term: l.label || l.name, path: l.name, type: 'number' }).catch(() => {});
    await qc.invalidateQueries({ queryKey: ['vocab', projectId] });
  }
  const insert = (text: string) => {
    const el = refs.current[focus]; const cur = draft?.i === focus ? draft.text : toLabels(lines[focus]?.expr || '', terms);
    const at = el && document.activeElement === el ? el.selectionStart ?? cur.length : cur.length;
    const before = cur.slice(0, at) + (at && !/\s$/.test(cur.slice(0, at)) && /^\w/.test(text) ? ' ' : '') + text;
    const next = before + cur.slice(at);
    emit(ls => ls.map((l, j) => (j === focus ? { ...l, expr: toPaths(next, terms) } : l)));
    if (draft?.i === focus) setDraft({ i: focus, text: next });
    // the caret goes right after what was put in, measured in the text as it will be shown
    const pos = draft?.i === focus ? before.length : toLabels(toPaths(before, terms), terms).length;
    setTimeout(() => { el?.focus(); el?.setSelectionRange(pos, pos); }, 0);
  };

  // work the sample through the lines
  const scope: Record<string, any> = { ...nest(sample), ...sample };
  const failed = new Set<string>();
  const results = lines.map(l => {
    if (!l.name || !l.expr.trim()) return { ok: true, value: undefined as any };
    const dep = Array.from(failed).find(b => new RegExp(`(?<![\\w.])${esc(b)}(?![\\w])`).test(l.expr));
    if (dep) { failed.add(l.name); return { ok: false, error: `depends on ${nameOf(lines.find(x => x.name === dep)!)} (error)` }; }
    // nothing to show until every value the line uses has been given
    const needs = (l.expr.match(/[A-Za-z_][\w.]*/g) || []).filter(w => !F[w.split('.')[0]] && w !== 'true' && w !== 'false');
    if (needs.some(w => getPath(scope, w) === undefined || getPath(scope, w) === '')) return { ok: true, value: undefined as any };
    try { const v = evaluate(l.expr, scope, terms.map(t => t.path)); scope[l.name] = v; return { ok: true, value: v }; }
    catch (e: any) { failed.add(l.name); return { ok: false, error: String(e?.message || e) }; }
  });

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-3">
        <div className="bg-white border border-[#e0e0e0]">
          {lines.map((l, i) => (
            <div key={i} data-calc-line={i} className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[#e0e0e0] last:border-b-0">
              <ResultName key={i} index={i} inputRef={el => { resultRefs.current[i] = el; }} missing={!l.name && !!l.expr.trim()} name={nameOf(l)} onDone={t => nameLine(i, t)} />
              <span className="text-[18px] text-[#525252]">=</span>
              <input ref={el => { refs.current[i] = el; }} aria-label={`Formula ${i + 1}`}
                onFocus={() => { setFocus(i); setDraft({ i, text: toLabels(latest.current[i]?.expr || '', terms) }); }}
                onBlur={() => setDraft(d => (d?.i === i ? null : d))}
                onKeyDown={e => { if (selectAllKey(e)) return; if (e.key === 'Enter') { e.preventDefault(); if (i === latest.current.length - 1) addLine(); else setFocusResult(i + 1); } }}
                className={`h-10 flex-1 basis-[420px] min-w-[260px] px-3 bg-[#f4f4f4] border-b ${l.name && !l.expr.trim() ? 'border-[#da1e28] border-b-2' : 'border-[#8d8d8d]'} text-[15px] outline-none focus:outline focus:outline-2 focus:outline-[#0f62fe] focus:-outline-offset-2`}
                value={draft?.i === i ? draft.text : toLabels(l.expr, terms)} placeholder="monthly payment ÷ monthly income × 100"
                onChange={e => { const v = e.target.value; setDraft({ i, text: v }); emit(ls => ls.map((x, j) => (j === i ? { ...x, expr: toPaths(v, terms) } : x))); }} />
              <span className="w-[150px] text-right text-[14px] tabular-nums text-[#161616]">
                {results[i]?.ok && results[i].value !== undefined ? showValue(typeof results[i].value === 'number' ? Math.round(results[i].value * 1e6) / 1e6 : results[i].value, term(l.name)) : ''}
              </span>
              <button type="button" tabIndex={-1} aria-label={`Remove line ${i + 1}`} disabled={lines.length === 1} onClick={() => emit(ls => ls.filter((_, j) => j !== i))}
                className="h-10 w-10 flex items-center justify-center text-[#525252] hover:bg-[#e8e8e8] disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
              {/* what is wrong with the line, on the line */}
              {results[i] && !results[i].ok && <div role="status" className="basis-full text-[13px] text-[#da1e28]">{(results[i] as any).error}</div>}
              {l.name && !l.expr.trim() && <div role="status" className="basis-full text-[13px] text-[#da1e28]">No formula</div>}
              {!l.name && l.expr.trim() && <div role="status" className="basis-full text-[13px] text-[#da1e28]">No result name</div>}
              {l.name && !isWord(l.name) && (
                <div className="basis-full flex items-center gap-3 text-[13px]">
                  <span className="text-[#525252]">“{nameOf(l)}” is not a word yet</span>
                  <button type="button" tabIndex={-1} className="h-8 px-3 text-[#0f62fe] hover:bg-[#e8e8e8]" onClick={() => addWord(i)}>Add word</button>
                </div>
              )}
            </div>
          ))}
          <button type="button" className="h-10 px-4 w-full text-left text-[14px] text-[#0f62fe] hover:bg-[#f4f4f4] flex items-center gap-1" onClick={addLine}><Plus className="h-4 w-4" /> Add line</button>
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {OPS.map(o => <button key={o} type="button" tabIndex={-1} onMouseDown={e => e.preventDefault()} onClick={() => insert(` ${o} `)} className="h-8 w-9 text-[14px] border border-[#c6c6c6] bg-white hover:bg-[#e8e8e8]">{o}</button>)}
            {FUNCS.map(fn => <button key={fn.name} type="button" tabIndex={-1} onMouseDown={e => e.preventDefault()} onClick={() => insert(fn.insert)} className="h-8 px-2 text-[13px] border border-[#c6c6c6] bg-white hover:bg-[#e8e8e8]" title={fn.help || fn.name}>{fn.label}</button>)}
          </div>
          <div className="flex flex-wrap gap-1 max-h-[180px] overflow-y-auto">
            {terms.filter(t => !produced.includes(t.path) || lines.findIndex(l => l.name === t.path) < focus).map(t => (
              <button key={t.id} type="button" tabIndex={-1} onMouseDown={e => e.preventDefault()} onClick={() => insert(t.term)} title={t.path} className="h-8 px-2 text-[13px] border border-[#c6c6c6] bg-white text-[#0f62fe] hover:bg-[#edf5ff]">{t.term}</button>
            ))}
            <RequestData projectId={projectId} ruleId={rule.id} />
          </div>
        </div>
      </div>
      <div className="bg-white border border-[#e0e0e0] p-4 h-fit">
        <div className="text-[14px] text-[#161616] mb-3">Try with</div>
        <InputFields title="" label={label} fields={used.map(name => ({ name, type: term(name)?.type === 'text' ? 'string' : 'number' }))} value={sample} onChange={setSample} />
        <div className="mt-4 border-t border-[#e0e0e0] pt-3 space-y-2 text-[14px]">
          {lines.map((l, i) => l.name && l.expr.trim() && results[i]?.ok && results[i].value !== undefined ? (
            <div key={i}><span className="text-[#525252]">{label(l.name)}</span> = <span className="text-[#525252]">{wordsInline(l.expr, label, terms.map(t => t.path))}</span> = <b className="font-semibold tabular-nums">{showValue(typeof results[i].value === 'number' ? Math.round(results[i].value * 1e6) / 1e6 : results[i].value, term(l.name))}</b></div>
          ) : null)}
        </div>
      </div>
    </div>
  );
}

/** The result's name: typed freely (cmd+A selects it), read on leaving the box or Enter; shows the saved name
 *  again when the saved name changes and the box is not being typed in. */
function ResultName({ index, name, onDone, inputRef, missing }: { index: number; name: string; onDone: (text: string) => void; inputRef?: (el: HTMLInputElement | null) => void; missing?: boolean }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input ref={inputRef} aria-label={`Result ${index + 1}`} aria-invalid={missing || undefined} className={`h-10 w-[220px] px-3 bg-[#f4f4f4] border-b ${missing ? 'border-[#da1e28] border-b-2' : 'border-[#8d8d8d]'} text-[15px] text-[#0f62fe] outline-none focus:outline focus:outline-2 focus:outline-[#0f62fe] focus:-outline-offset-2`}
      value={text ?? name} placeholder="Result" onFocus={() => setText(name)} onChange={e => setText(e.target.value)}
      onKeyDown={e => { if (selectAllKey(e)) return; if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } if (e.key === 'Escape') { setText(name); } }}
      onBlur={() => { const t = text; setText(null); if (t !== null && t.trim() !== name) onDone(t); }} />
  );
}
