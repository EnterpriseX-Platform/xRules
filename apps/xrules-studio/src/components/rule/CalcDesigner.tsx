'use client';
// Calculations in business words: each line is "result = expression", built from vocabulary terms and a few
// functions. Results become terms other rules can use. A sample panel works the lines out as you type.
import { useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useTerms, showValue, type Term } from '@/lib/terms';
import { InputFields } from '@/components/test/FieldsEditor';
import { useQueryClient } from '@tanstack/react-query';

type Line = { name: string; expr: string };
const FUNCS: { name: string; insert: string; label: string }[] = [
  { name: 'SUM', insert: 'SUM(', label: 'Sum' }, { name: 'AVG', insert: 'AVG(', label: 'Average' }, { name: 'COUNT', insert: 'COUNT(', label: 'Count' },
  { name: 'MIN', insert: 'MIN(', label: 'Lowest' }, { name: 'MAX', insert: 'MAX(', label: 'Highest' },
  { name: 'ROUND', insert: 'ROUND(', label: 'Round' }, { name: 'ROUNDDOWN', insert: 'ROUNDDOWN(', label: 'Round down' }, { name: 'IF', insert: 'IF(', label: 'If … then … else' },
];
const OPS = ['+', '−', '×', '÷', '(', ')', '≥', '≤', '='];

// same functions the engine uses
const F: Record<string, any> = {
  SUM: (a: any, k?: string) => (Array.isArray(a) ? a : [a]).reduce((s: number, x: any) => s + (Number(k ? x?.[k] : x) || 0), 0),
  AVG: (a: any, k?: string) => { const xs = (Array.isArray(a) ? a : [a]).map((x: any) => Number(k ? x?.[k] : x)).filter((n: number) => !isNaN(n)); return xs.length ? xs.reduce((s: number, n: number) => s + n, 0) / xs.length : 0; },
  COUNT: (a: any) => (Array.isArray(a) ? a.length : a == null ? 0 : 1),
  MIN: (...a: any[]) => Math.min(...a.flat().map(Number)), MAX: (...a: any[]) => Math.max(...a.flat().map(Number)),
  ROUND: (x: any, d = 0) => { const f = Math.pow(10, d); return Math.round(Number(x) * f) / f; },
  ROUNDDOWN: (x: any, d = 0) => { const f = Math.pow(10, d); return Math.floor(Number(x) * f) / f; },
  ROUNDUP: (x: any, d = 0) => { const f = Math.pow(10, d); return Math.ceil(Number(x) * f) / f; },
  IF: (c: any, a: any, b: any) => (c ? a : b),
};
const js = (e: string) => e.replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/≠/g, '!=').replace(/(^|[^=!<>])=(?!=)/g, '$1==');
function evaluate(expr: string, scope: Record<string, any>) {
  const names = Object.keys(scope).filter(k => /^[A-Za-z_$][\w$]*$/.test(k));
  // eslint-disable-next-line no-new-func
  return new Function(...names, ...Object.keys(F), `"use strict"; return (${js(expr)});`)(...names.map(n => scope[n]), ...Object.values(F));
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function toLabels(expr: string, terms: Term[]) {
  let out = expr;
  [...terms].sort((a, b) => b.path.length - a.path.length).forEach(t => { if (t.term !== t.path) out = out.replace(new RegExp(`(?<![\\w.])${esc(t.path)}(?![\\w])`, 'g'), `⟦${t.term}⟧`); });
  return out.replace(/⟦|⟧/g, '');
}
function toPaths(text: string, terms: Term[]) {
  let out = text;
  [...terms].sort((a, b) => b.term.length - a.term.length).forEach(t => { if (t.term !== t.path) out = out.split(t.term).join(t.path); });
  return out.replace(/−/g, '-');
}
const slug = (s: string, i: number) => { const a = s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); return /^[a-z]/.test(a) ? a : `result_${i + 1}`; };

export function CalcDesigner({ rule, projectId, onChange }: { rule: any; projectId: string; onChange: (def: any) => void }) {
  const qc = useQueryClient();
  const [lines, setLines] = useState<Line[]>(() => (Array.isArray(rule.definition?.lines) && rule.definition.lines.length ? rule.definition.lines : [{ name: '', expr: '' }]));
  const { terms, label, term } = useTerms(projectId);
  const [focus, setFocus] = useState(0);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [sample, setSample] = useState<Record<string, any>>({});
  const emit = (ls: Line[]) => { setLines(ls); onChange({ ...(rule.definition || {}), lines: ls }); };
  const produced = lines.map(l => l.name).filter(Boolean);
  const used = useMemo(() => {
    const set = new Set<string>();
    lines.forEach(l => (l.expr.match(/[A-Za-z_][\w.]*/g) || []).forEach(w => { const root = w.split('.')[0]; if (!F[root] && !produced.includes(root) && root !== 'true' && root !== 'false') set.add(root); }));
    return Array.from(set);
  }, [lines]); // eslint-disable-line react-hooks/exhaustive-deps

  async function nameLine(i: number, text: string) {
    const t = text.trim(); if (!t) return;
    const existing = terms.find(x => x.term === t || x.path === t);
    let path = existing?.path;
    if (!existing) {
      path = slug(t, i); let n = 2; while (terms.some(x => x.path === path)) path = `${slug(t, i)}_${n++}`;
      await api.post('/platform/vocabulary', { projectId, term: t, path, type: 'number' }).catch(() => {});
      qc.invalidateQueries({ queryKey: ['vocab', projectId] });
    }
    emit(lines.map((l, j) => (j === i ? { ...l, name: path! } : l)));
  }
  const insert = (text: string) => {
    const el = refs.current[focus]; const cur = toLabels(lines[focus]?.expr || '', terms);
    const at = el?.selectionStart ?? cur.length;
    const next = cur.slice(0, at) + text + cur.slice(at);
    emit(lines.map((l, j) => (j === focus ? { ...l, expr: toPaths(next, terms) } : l)));
    setTimeout(() => { el?.focus(); el?.setSelectionRange(at + text.length, at + text.length); }, 0);
  };

  // work the sample through the lines
  const scope: Record<string, any> = { ...sample };
  const results = lines.map(l => {
    if (!l.name || !l.expr.trim()) return { ok: true, value: undefined as any };
    try { const v = evaluate(l.expr, scope); scope[l.name] = v; return { ok: true, value: v }; }
    catch (e: any) { return { ok: false, error: String(e?.message || e) }; }
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-3">
        <div className="bg-white border border-[#e0e0e0]">
          {lines.map((l, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[#e0e0e0] last:border-b-0">
              <input aria-label={`Result ${i + 1}`} className="h-10 w-[220px] px-3 bg-[#f4f4f4] border-b border-[#8d8d8d] text-[15px] text-[#0f62fe] outline-none focus:outline focus:outline-2 focus:outline-[#0f62fe] focus:-outline-offset-2"
                defaultValue={l.name ? label(l.name) : ''} placeholder="Result" onBlur={e => nameLine(i, e.target.value)} />
              <span className="text-[18px] text-[#525252]">=</span>
              <input ref={el => { refs.current[i] = el; }} aria-label={`Formula ${i + 1}`} onFocus={() => setFocus(i)}
                className="h-10 flex-1 min-w-[260px] px-3 bg-[#f4f4f4] border-b border-[#8d8d8d] text-[15px] outline-none focus:outline focus:outline-2 focus:outline-[#0f62fe] focus:-outline-offset-2"
                value={toLabels(l.expr, terms)} placeholder="monthly payment ÷ monthly income × 100"
                onChange={e => emit(lines.map((x, j) => (j === i ? { ...x, expr: toPaths(e.target.value, terms) } : x)))} />
              <span className={`w-[150px] text-right text-[14px] tabular-nums ${results[i] && !results[i].ok ? 'text-[#da1e28]' : 'text-[#161616]'}`} title={(results[i] as any)?.error}>
                {results[i]?.ok ? (results[i].value === undefined ? '' : showValue(typeof results[i].value === 'number' ? Math.round(results[i].value * 1e6) / 1e6 : results[i].value, term(l.name))) : 'Check the formula'}
              </span>
              <button type="button" aria-label={`Remove line ${i + 1}`} disabled={lines.length === 1} onClick={() => emit(lines.filter((_, j) => j !== i))}
                className="h-10 w-10 flex items-center justify-center text-[#525252] hover:bg-[#e8e8e8] disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button type="button" className="h-10 px-4 w-full text-left text-[14px] text-[#0f62fe] hover:bg-[#f4f4f4] flex items-center gap-1" onClick={() => emit([...lines, { name: '', expr: '' }])}><Plus className="h-4 w-4" /> Add line</button>
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {terms.filter(t => !produced.includes(t.path) || lines.findIndex(l => l.name === t.path) < focus).map(t => (
              <button key={t.id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => insert(t.term)} className="h-8 px-2 text-[13px] border border-[#c6c6c6] bg-white text-[#0f62fe] hover:bg-[#edf5ff]">{t.term}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {OPS.map(o => <button key={o} type="button" onMouseDown={e => e.preventDefault()} onClick={() => insert(` ${o} `)} className="h-8 w-9 text-[14px] border border-[#c6c6c6] bg-white hover:bg-[#e8e8e8]">{o}</button>)}
            {FUNCS.map(fn => <button key={fn.name} type="button" onMouseDown={e => e.preventDefault()} onClick={() => insert(fn.insert)} className="h-8 px-2 text-[13px] border border-[#c6c6c6] bg-white hover:bg-[#e8e8e8]" title={fn.name}>{fn.label}</button>)}
          </div>
        </div>
      </div>
      <div className="bg-white border border-[#e0e0e0] p-4 h-fit">
        <div className="text-[14px] text-[#161616] mb-3">Try with</div>
        <InputFields title="" label={label} fields={used.map(name => ({ name, type: term(name)?.type === 'text' ? 'string' : 'number' }))} value={sample} onChange={setSample} />
        <div className="mt-4 border-t border-[#e0e0e0] pt-3 space-y-2 text-[14px]">
          {lines.map((l, i) => l.name && l.expr.trim() && results[i]?.ok && results[i].value !== undefined ? (
            <div key={i}><span className="text-[#525252]">{label(l.name)}</span> = <span className="text-[#525252]">{toLabels(l.expr, terms)}</span> = <b className="font-semibold tabular-nums">{showValue(typeof results[i].value === 'number' ? Math.round(results[i].value * 1e6) / 1e6 : results[i].value, term(l.name))}</b></div>
          ) : null)}
        </div>
      </div>
    </div>
  );
}
