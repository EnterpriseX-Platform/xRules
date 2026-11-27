'use client';
// A decision table read and edited as business sentences:
//   1  If monthly income is less than 15,000 THB then approved limit = 0 THB
// Same definition as the table view ({ inputs, outputs, rules }); only the presentation differs.
import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Dropdown } from '@/components/pipeline/Dropdown';
import { ValueCombo } from './ValueCombo';
import { parseCellExpression, formatCellExpression } from './operators';
import { tableChecks } from './tableChecks';
import { showValue, type Term } from '@/lib/terms';
import { FmtInput } from '@/components/ui/FmtInput';
import { DropZone } from '@/components/pipeline/ui';
import { tableSentences } from '@/components/review/sentences';
import { readTable } from '@/lib/termImport';

const PAGE = 100;

export const OP_TH: { value: string; label: string; args: 0 | 1 | 2 }[] = [
  { value: '=', label: 'is', args: 1 },
  { value: '!=', label: 'is not', args: 1 },
  { value: '<', label: 'is less than', args: 1 },
  { value: '<=', label: 'is at most', args: 1 },
  { value: '>', label: 'is more than', args: 1 },
  { value: '>=', label: 'is at least', args: 1 },
  { value: 'BTW', label: 'is between', args: 2 },
  { value: 'IN', label: 'is one of', args: 1 },
  { value: '!IN', label: 'is not one of', args: 1 },
  { value: 'NULL', label: 'is empty', args: 0 },
  { value: '!NULL', label: 'has a value', args: 0 },
];

type Def = { hitPolicy?: string; inputs?: any[]; outputs?: any[]; rules?: any[] };
const isAny = (cell: any) => { const o = parseCellExpression(cell).operator; return o === 'ANY' || o === 'ELSE'; };
const nid = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

function Chip({ children, className = '', title }: { children: React.ReactNode; className?: string; title?: string }) {
  return <span title={title} className={`inline-flex items-center h-8 px-1 border-b-2 border-[#0f62fe] text-[#0f62fe] ${className}`}>{children}</span>;
}
const plain = 'h-8 bg-transparent outline-none border-b-2 border-[#0f62fe] text-[#0f62fe] px-1 text-[15px] focus:bg-[#edf5ff]';

type Reason = { code: string; text: string; outcome: string; priority: number };
const word = 'h-8 px-1 text-[13px] text-[#0f62fe] hover:underline';

/** Choose a term, or type a new name and add it as a term. */
function TermPicker({ options, onPick, onCreate, placeholder = 'Choose data', onClose, emptyText = 'Type a name to add a term' }: {
  options: { value: string; label: string }[]; onPick: (v: string) => void; onCreate?: (name: string) => Promise<string | null>; placeholder?: string; onClose: () => void; emptyText?: string;
}) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const shown = options.filter(o => !q || o.label.toLowerCase().includes(q.toLowerCase()) || o.value.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  const exact = options.some(o => o.label.toLowerCase() === q.trim().toLowerCase());
  return (
    <span className="relative inline-block min-w-[220px]">
      <input autoFocus aria-label={placeholder} placeholder={placeholder} className={`${plain} w-full`} value={q} onChange={e => setQ(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter') { e.preventDefault(); if (shown[0]) onPick(shown[0].value); } }}
        onBlur={() => setTimeout(() => { if (!busy) onClose(); }, 150)} />
      <span className="absolute left-0 top-full z-20 mt-px w-[280px] max-h-[280px] overflow-auto bg-white shadow-[0_2px_6px_rgba(0,0,0,.3)] text-[14px] text-[#161616] leading-normal">
        {shown.map(o => <button key={o.value} type="button" className="block w-full text-left px-3 h-9 hover:bg-[#e8e8e8] truncate" onMouseDown={e => e.preventDefault()} onClick={() => onPick(o.value)}>{o.label}</button>)}
        {onCreate && q.trim() && !exact && (
          <button type="button" className="block w-full text-left px-3 h-9 text-[#0f62fe] hover:bg-[#e8e8e8] border-t border-[#e0e0e0] truncate" disabled={busy} onMouseDown={e => e.preventDefault()}
            onClick={async () => { setBusy(true); const p = await onCreate(q.trim()).catch(() => null); setBusy(false); if (p) onPick(p); }}>Add term &ldquo;{q.trim()}&rdquo;</button>
        )}
        {!shown.length && !q.trim() && <span className="block px-3 py-2 text-[#6f6f6f]">{emptyText}</span>}
      </span>
    </span>
  );
}

export function RuleSentences({ def, onChange, label, term, terms, onAddTerm, reasons = [], live }: {
  def: Def; onChange: (d: Def) => void; label: (path: string) => string; term: (path: string) => Term | undefined; terms: Term[];
  onAddTerm?: (name: string) => Promise<string | null>; reasons?: Reason[]; live?: Def | null;
}) {
  const inputs: any[] = def.inputs || []; const outputs: any[] = def.outputs || []; const rules: any[] = def.rules || [];
  // which picker is open: "and" on the main group, "or" for a new group, a group index, a result or a reason
  const [adding, setAdding] = useState<{ ri: number; to: 'and' | 'or' | number | 'result' | 'reason' } | null>(null);
  const emit = (p: Partial<Def>) => onChange({ ...def, ...p });
  const setCell = (ri: number, side: 'inputs' | 'outputs', ci: number, v: any) =>
    emit({ rules: rules.map((r, i) => (i === ri ? { ...r, [side]: Object.assign([...(r[side] || [])], { [ci]: v }) } : r)) });
  const setRow = (ri: number, p: any) => emit({ rules: rules.map((r, i) => (i === ri ? { ...r, ...p } : r)) });
  const fmt = (name: string, n: number) => showValue(n, term(name));
  // a value side may be a small formula of words and numbers: shown with the words, kept with the data paths
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const byLen = useMemo(() => [...terms].filter(t => t.term && t.path && t.term !== t.path), [terms]);
  const toWords = (v: any) => { let o = String(v ?? ''); if (!/[A-Za-z_]/.test(o)) return o; [...byLen].sort((a, b) => b.path.length - a.path.length).forEach(t => { o = o.replace(new RegExp(`(?<![\\w.])${esc(t.path)}(?![\\w])`, 'g'), `⟦${t.term}⟧`); }); return o.replace(/⟦|⟧/g, '').replace(/\s*\*\s*/g, ' × ').replace(/\s*\/\s*/g, ' ÷ '); };
  const toPaths = (v: string) => { let o = v; if (!/[×÷*/+()]|\s-\s|^[A-Z_]+\(/.test(o)) return o; [...byLen].sort((a, b) => b.term.length - a.term.length).forEach(t => { o = o.replace(new RegExp(`(?<![\\p{L}\\p{N}_.])${esc(t.term)}(?![\\p{L}\\p{N}_])`, 'gu'), t.path); }); return o.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-'); };
  // many lines: find, changed only, paging; change state against the live version
  const [find, setFind] = useState(''); const [changedOnly, setChangedOnly] = useState(false); const [page, setPage] = useState(0);
  const change = useMemo(() => {
    const m = new Map<number, 'New' | 'Changed'>(); if (!live) return { m, removed: 0 };
    const sig = (r: any) => JSON.stringify(live.inputs?.length === inputs.length ? [r.inputs, r.outputs, r.or, r.match, r.reasons] : [r.inputs, r.outputs]);
    const byId = new Map((live.rules || []).map((r: any, i: number) => [r.id || `#${i}`, r]));
    rules.forEach((r, i) => { const o: any = byId.get(r.id || `#${i}`); if (!o) m.set(i, 'New'); else if (sig(o) !== sig(r)) m.set(i, 'Changed'); });
    const ids = new Set(rules.map((r, i) => r.id || `#${i}`));
    return { m, removed: (live.rules || []).filter((r: any, i: number) => !ids.has(r.id || `#${i}`)).length };
  }, [live, rules, inputs.length]);
  const texts = useMemo(() => (find ? tableSentences(def, label).map(t => t.toLowerCase()) : []), [find, def, label]);
  const matched = rules.map((_, i) => i).filter(i => (!changedOnly || change.m.has(i)) && (!find || (texts[i] || '').includes(find.toLowerCase())));
  const pages = Math.max(1, Math.ceil(matched.length / PAGE)); const pg = Math.min(page, pages - 1);
  const shown = matched.slice(pg * PAGE, pg * PAGE + PAGE);
  const exportXlsx = async () => {
    const ExcelJS = (await import('exceljs')).default; const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Lines');
    ws.addRow(['No.', ...inputs.map(c => label(c.name)), ...outputs.map(o => label(o.name)), 'Reasons']);
    rules.forEach((r, i) => ws.addRow([i + 1, ...inputs.map((_, ci) => String(r.inputs?.[ci] ?? '-')), ...outputs.map((_, oi) => r.outputs?.[oi] ?? ''), (r.reasons || []).join(' ')]));
    const buf = await wb.xlsx.writeBuffer(); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf])); a.download = 'lines.xlsx'; a.click();
  };
  const [importing, setImporting] = useState(false); const [importErr, setImportErr] = useState(''); const [pasted, setPasted] = useState('');
  const importXlsx = async (f: File | string) => {
    try {
      const table = await readTable(f); const head = (table[0] || []).map((v: any) => String(v ?? '').trim());
      const col = (name: string) => head.findIndex(h => h === label(name) || h === name);
      // columns naming a word this decision does not ask about yet become new conditions
      const lc = (x: string) => x.toLowerCase();
      const extra = head.map(h => (h && h !== 'No.' && h !== 'Reasons' && !inputs.some(c => c.name === h || label(c.name) === h) && !outputs.some(o => o.name === h || label(o.name) === h) ? terms.find(t => lc(t.term) === lc(h) || t.path === h) : undefined))
        .filter((t, i, a): t is Term => !!t && a.findIndex(x => x?.path === t.path) === i);
      const allIn = [...inputs, ...extra.map(t => ({ name: t.path, type: t.type === 'money' ? 'number' : t.type, label: t.term }))];
      const colT = (name: string) => { const t = term(name); return head.findIndex(h => h === label(name) || h === name || (!!t && lc(h) === lc(t.term))); };
      const ic = allIn.map(c => colT(c.name)), oc = outputs.map(o => col(o.name)), rc = head.indexOf('Reasons');
      if (ic.some(i => i < 0) || oc.some(i => i < 0)) throw new Error(`The first row must name these columns: ${[...inputs, ...outputs].map(c => label(c.name)).join(', ')}`);
      const rows: any[] = []; const old = new Map(rules.map((r, i) => [i + 1, r]));
      table.slice(1).forEach((v: any[], k: number) => { const n = k + 2; void n; if (!v.some(x => x !== null && x !== undefined && String(x).trim() !== '')) return; const no = Number(v[head.indexOf('No.')]);
        const prev: any = old.get(no) || {};
        rows.push({ ...prev, id: prev.id || nid(), inputs: ic.map(i => toPaths(String(v[i] ?? '-')) || '-'), outputs: oc.map(i => { const x = v[i]; return x === undefined || x === '' ? null : typeof x === 'object' && x?.result !== undefined ? x.result : x; }), ...(rc >= 0 && { reasons: String(v[rc] ?? '').split(/\s+/).filter(Boolean) }) }); });
      onChange({ ...def, inputs: allIn, rules: rows }); setImporting(false); setImportErr(''); setPasted('');
    } catch (e: any) { setImportErr(String(e?.message || e)); }
  };
  const findings = useMemo(() => tableChecks(def, label, fmt), [def, label]); // eslint-disable-line react-hooks/exhaustive-deps

  function addRow() {
    const blank = { id: nid(), inputs: inputs.map(() => '-'), outputs: outputs.map(() => null) };
    const last = rules[rules.length - 1];
    const catchAll = last && (last.inputs || []).every(isAny) && !(last.or || []).length && !(last.reasons || []).length;
    emit({ rules: catchAll ? [...rules.slice(0, -1), blank, last] : [...rules, blank] });
  }
  // make sure a column exists for the field (new columns start as "any" on every line)
  function withColumn(path: string): { nextInputs: any[]; nextRules: any[]; ci: number } {
    let ci = inputs.findIndex(c => c.name === path);
    if (ci >= 0) return { nextInputs: inputs, nextRules: rules, ci };
    const t = term(path);
    const nextInputs = [...inputs, { name: path, type: t?.type === 'money' ? 'number' : (t?.type || 'string'), label: t?.term }];
    return { nextInputs, nextRules: rules.map(r => ({ ...r, inputs: [...(r.inputs || []), '-'] })), ci: nextInputs.length - 1 };
  }
  function addCondition(ri: number, path: string, to: 'and' | 'or' | number) {
    setAdding(null);
    const { nextInputs, nextRules, ci } = withColumn(path);
    const rows = nextRules.map((r, i) => {
      if (i !== ri) return r;
      if (to === 'and') return { ...r, inputs: Object.assign([...r.inputs], { [ci]: '= ' }), seq: [...(r.seq || nextInputs.filter((_: any, k: number) => !isAny(r.inputs?.[k])).map((c: any) => c.name)).filter((n: string) => n !== path), path] };
      const or = [...(r.or || [])];
      if (to === 'or') or.push({ when: { [path]: '= ' } }); else or[to] = { ...or[to], when: { ...(or[to]?.when || {}), [path]: '= ' } };
      return { ...r, or };
    });
    onChange({ ...def, inputs: nextInputs, rules: rows });
  }
  function addResult(path: string) {
    setAdding(null);
    if (outputs.some(o => o.name === path)) return;
    const t = term(path);
    onChange({ ...def, outputs: [...outputs, { name: path, type: t?.type === 'money' ? 'number' : (t?.type || 'string'), label: t?.term }], rules: rules.map(r => ({ ...r, outputs: [...(r.outputs || []), null] })) });
  }
  const setOrCell = (ri: number, gi: number, name: string, v: any) => {
    const or = [...(rules[ri].or || [])]; const when = { ...(or[gi]?.when || {}) };
    if (v === '-') delete when[name]; else when[name] = v;
    or[gi] = { ...or[gi], when };
    setRow(ri, { or: or.filter(g => Object.keys(g.when || {}).length) });
  };

  const condEditor = (key: string, name: string, cell: any, set: (v: any) => void) => {
    const { operator, args } = parseCellExpression(cell);
    const spec = OP_TH.find(o => o.value === operator) || OP_TH[0];
    const t = term(name);
    const put = (op: string, a: any[]) => set(formatCellExpression(op, a));
    return (
      <span key={key} className="inline-flex flex-wrap items-center gap-x-1.5">
        <Chip title={name}>{label(name)}</Chip>
        <span className="inline-block">
          {/* typed or picked with the arrow keys; no page jump */}
          <ValueCombo className={`${plain} w-[120px]`} value={spec.label} values={OP_TH.map(o => o.label)} ariaLabel={`${label(name)} comparison`}
            onChange={l => { const o = OP_TH.find(x => x.label === l) || OP_TH.find(x => x.label.toLowerCase().startsWith(l.toLowerCase())); if (o) put(o.value, o.args === 2 ? [args[0] ?? '', args[1] ?? ''] : [args[0] ?? '']); }} />
        </span>
        {(operator === 'IN' || operator === '!IN') ? (() => {
          // one of several values: each value a removable piece, Enter adds the next one
          const vals = String(args[0] ?? '').split(',').map(x => x.trim()).filter(Boolean);
          return <>
            {vals.map((v, k) => <span key={v} className="inline-flex items-center"><Chip>{v}</Chip><button type="button" aria-label={`Remove ${v}`} className="h-6 w-5 text-[#8d8d8d] hover:text-[#da1e28]" onClick={() => put(operator, [vals.filter((_, i) => i !== k).join(', ')])}>×</button></span>)}
            <ValueCombo className={`${plain} min-w-[90px]`} value="" placeholder={vals.length ? 'another' : 'value'} values={(t?.values || []).filter(x => !vals.includes(x))} ariaLabel={`${label(name)} value`}
              onChange={v => { const add = v.split(',').map(x => x.trim()).filter(Boolean); if (add.length) put(operator, [Array.from(new Set([...vals, ...add])).join(', ')]); }} />
          </>;
        })()
        : spec.args >= 1 && ((t?.type === 'enum' || t?.type === 'text' || t?.type === 'string' || t?.values?.length) && spec.args === 1
          ? <ValueCombo className={`${plain} min-w-[90px]`} value={toWords(args[0] ?? '')} values={t?.values || []} ariaLabel={`${label(name)} value`} onChange={v => put(operator, [toPaths(v)])} />
          : spec.args >= 1 && <FmtInput className={`${plain} text-right`} value={toWords(args[0] ?? '')} aria-label={`${label(name)} value`} onChange={v => put(operator, spec.args === 2 ? [toPaths(v), args[1] ?? ''] : [toPaths(v)])} />)}
        {spec.args === 2 && <><span>and</span><FmtInput className={`${plain} text-right`} value={args[1] ?? ''} aria-label={`${label(name)} to`} onChange={v => put(operator, [args[0] ?? '', v])} /></>}
        {spec.args >= 1 && t?.unit && <span className="text-[#525252]">{t.unit}</span>}
        <button type="button" aria-label="Remove condition" className="h-6 w-6 text-[#8d8d8d] hover:text-[#da1e28] opacity-0 group-hover:opacity-100" onClick={() => set('-')}>×</button>
      </span>
    );
  };
  const modeToggle = (mode: string | undefined, onSet: (m: 'all' | 'any') => void) => (
    <button type="button" className="h-8 px-1 text-[15px] text-[#0f62fe] border-b-2 border-dashed border-[#0f62fe]" title="Switch between all of and any of" onClick={() => onSet(mode === 'any' ? 'all' : 'any')}>{mode === 'any' ? 'any of' : 'all of'}</button>
  );
  const picker = (ri: number, to: 'and' | 'or' | number, exclude: string[]) => (
    <TermPicker onClose={() => setAdding(null)} onCreate={onAddTerm} onPick={p => p && addCondition(ri, p, to)}
      options={[...inputs.map(c => c.name), ...terms.map(t => t.path)].filter((p, i, a) => a.indexOf(p) === i && !exclude.includes(p) && !outputs.some(o => o.name === p)).map(p => ({ value: p, label: label(p) }))} />
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={find} onChange={e => { setFind(e.target.value); setPage(0); }} placeholder="Find lines" aria-label="Find lines" className="h-10 w-[280px] px-4 bg-white border-b border-[#8d8d8d] text-[14px] outline-none focus:outline focus:outline-2 focus:outline-[#0f62fe]" />
        {live && <button type="button" aria-pressed={changedOnly} onClick={() => { setChangedOnly(!changedOnly); setPage(0); }} className={`h-10 px-4 text-[14px] border ${changedOnly ? 'bg-[#161616] text-white border-[#161616]' : 'border-[#8d8d8d] text-[#161616] hover:bg-[#e8e8e8]'}`}>Changed only · {change.m.size}</button>}
        <span className="flex-1" />
        <span className="text-[13px] text-[#525252] tabular-nums">{rules.length.toLocaleString()} line{rules.length === 1 ? '' : 's'}{change.removed ? ` · ${change.removed} removed` : ''}</span>
        <button type="button" className="h-10 px-4 text-[14px] text-[#0f62fe] hover:bg-[#e8e8e8]" onClick={() => setImporting(!importing)}>Import Excel</button>
        <button type="button" className="h-10 px-4 text-[14px] text-[#0f62fe] hover:bg-[#e8e8e8]" onClick={exportXlsx}>Export Excel</button>
      </div>
      {importing && <div className="space-y-2"><DropZone accept=".xlsx,.csv" label="Drop an Excel file with the same columns as Export Excel, or click to choose" onFile={importXlsx} />
        <textarea aria-label="Or paste lines copied from Excel, first row naming the columns" placeholder={`Or paste lines copied from Excel, first row: No.\t${[...inputs, ...outputs].map(c => label(c.name)).join('\t')}\tReasons`} value={pasted} onChange={e => setPasted(e.target.value)}
          className="w-full h-28 px-3 py-2 bg-[#f4f4f4] border-b border-[#8d8d8d] text-[13px] font-mono outline-none focus:outline focus:outline-2 focus:outline-[#0f62fe] focus:-outline-offset-2" />
        <button type="button" disabled={!pasted.trim()} className="h-10 px-4 text-[14px] bg-[#0f62fe] text-white disabled:bg-[#c6c6c6]" onClick={() => importXlsx(pasted)}>Read pasted lines</button>{importErr && <div className="text-[14px] text-[#da1e28]">{importErr}</div>}</div>}
      <div className="bg-white border border-[#e0e0e0]">
        {shown.map(ri => { const r = rules[ri];
          const seq: string[] = r.seq || [];
          const conds = inputs.map((c, ci) => ({ c, ci, cell: r.inputs?.[ci] })).filter(x => !isAny(x.cell))
            .sort((a, b) => { const x = seq.indexOf(a.c.name), y = seq.indexOf(b.c.name); return (x < 0 ? -1 : x) - (y < 0 ? -1 : y) || a.ci - b.ci; });
          const groups: any[] = r.or || [];
          const join = r.match === 'any' ? 'or' : 'and';
          const rowReasons: string[] = r.reasons || [];
          const open = adding?.ri === ri ? adding.to : null;
          const nothing = conds.length === 0 && !groups.length;
          return (
            <div key={r.id || ri} className="group flex items-start gap-3 px-4 py-2 border-b border-[#e0e0e0] last:border-b-0 text-[15px] text-[#161616] leading-8">
              <span className="w-6 shrink-0 text-right text-[13px] text-[#6f6f6f] tabular-nums pt-px">{ri + 1}</span>
              <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-1.5">
                {nothing && ri === rules.length - 1 ? <span>Otherwise</span> : <span>If</span>}
                {conds.length > 1 && modeToggle(r.match, m => setRow(ri, { match: m === 'any' ? 'any' : undefined }))}
                {conds.map(({ c, ci, cell }, k) => (
                  <span key={ci} className="inline-flex flex-wrap items-center gap-x-1.5">{k > 0 && <span>{join}</span>}{condEditor(`m${ci}`, c.name, cell, v => setCell(ri, 'inputs', ci, v))}</span>
                ))}
                {open === 'and' ? picker(ri, 'and', conds.map(x => x.c.name))
                  : <button type="button" className={word} onClick={() => setAdding({ ri, to: 'and' })}>{conds.length ? `+ ${join}` : '+ condition'}</button>}
                {groups.map((g, gi) => {
                  const cells = Object.entries(g.when || {});
                  const gj = g.match === 'any' ? 'or' : 'and';
                  return (
                    <span key={gi} className="inline-flex flex-wrap items-center gap-x-1.5 pl-2 border-l-2 border-[#8d8d8d]">
                      <span className="font-semibold">or</span>
                      {cells.length > 1 && modeToggle(g.match, m => { const or = [...groups]; or[gi] = { ...g, match: m === 'any' ? 'any' : undefined }; setRow(ri, { or }); })}
                      {cells.map(([name, cell], k) => <span key={name} className="inline-flex flex-wrap items-center gap-x-1.5">{k > 0 && <span>{gj}</span>}{condEditor(`g${gi}${name}`, name, cell, v => setOrCell(ri, gi, name, v))}</span>)}
                      {open === gi ? picker(ri, gi, cells.map(([n]) => n)) : <button type="button" className={word} onClick={() => setAdding({ ri, to: gi })}>+ {gj}</button>}
                    </span>
                  );
                })}
                {!nothing && (open === 'or' ? picker(ri, 'or', []) : <button type="button" className={word} onClick={() => setAdding({ ri, to: 'or' })}>+ or</button>)}
                <span className="mx-1">then</span>
                {outputs.map((o, oi) => {
                  const t = term(o.name);
                  return (
                    <span key={oi} className="inline-flex items-center gap-x-1.5">
                      {oi > 0 && <span>,</span>}
                      <Chip>{label(o.name)}</Chip><span>=</span>
                      <FmtInput className={`${plain} text-right`} value={r.outputs?.[oi] ?? ''} aria-label={`${label(o.name)} result`}
                        onChange={v => { setCell(ri, 'outputs', oi, v === '' ? null : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v === 'true' ? true : v === 'false' ? false : v); }} />
                      {t?.unit && <span className="text-[#525252]">{t.unit}</span>}
                    </span>
                  );
                })}
                {rowReasons.map((code, k) => {
                  const rc = reasons.find(x => x.code === code);
                  return (
                    <span key={code} className="inline-flex items-center gap-x-1.5">
                      {(k > 0 || outputs.length > 0) && <span>,</span>}<span>add reason</span>
                      <Chip><span className="font-mono text-[13px] mr-1.5">{code}</span>{rc?.text || ''}</Chip>
                      <button type="button" aria-label={`Remove reason ${code}`} className="h-6 w-6 text-[#8d8d8d] hover:text-[#da1e28] opacity-0 group-hover:opacity-100" onClick={() => setRow(ri, { reasons: rowReasons.filter(x => x !== code) })}>×</button>
                    </span>
                  );
                })}
                {open === 'result'
                  ? <TermPicker placeholder="Choose result" onClose={() => setAdding(null)} onCreate={onAddTerm} onPick={addResult}
                      options={terms.map(t => t.path).filter(p => !outputs.some(o => o.name === p) && !inputs.some(c => c.name === p)).map(p => ({ value: p, label: label(p) }))} />
                  : open === 'reason'
                  ? <TermPicker placeholder="Choose reason" emptyText="No reason codes yet (Words › Reason codes)" onClose={() => setAdding(null)} onPick={code => { setAdding(null); setRow(ri, { reasons: Array.from(new Set([...rowReasons, code])) }); }}
                      options={reasons.filter(x => !rowReasons.includes(x.code)).map(x => ({ value: x.code, label: `${x.code} ${x.text}` }))} />
                  : <>
                      <button type="button" className={`${word} ${outputs.length || rowReasons.length ? 'opacity-0 group-hover:opacity-100' : ''}`} onClick={() => setAdding({ ri, to: 'result' })}>+ result</button>
                      <button type="button" className={`${word} ${outputs.length || rowReasons.length ? 'opacity-0 group-hover:opacity-100' : ''}`} onClick={() => setAdding({ ri, to: 'reason' })}>+ add reason</button>
                    </>}
              </div>
              {change.m.has(ri) && <span className={`shrink-0 text-[13px] pt-px ${change.m.get(ri) === 'New' ? 'text-[#198038]' : 'text-[#0043ce]'}`}>{change.m.get(ri)}</span>}
              <button type="button" aria-label={`Remove rule ${ri + 1}`} className="h-8 w-8 shrink-0 flex items-center justify-center text-[#525252] hover:bg-[#e8e8e8] opacity-0 group-hover:opacity-100"
                onClick={() => emit({ rules: rules.filter((_, i) => i !== ri) })}><Trash2 className="h-4 w-4" /></button>
            </div>
          );
        })}
        {!shown.length && <div className="px-4 py-6 text-[14px] text-[#525252]">No lines match</div>}
        {pages > 1 && (
          <div className="flex items-center gap-3 px-4 h-10 border-t border-[#e0e0e0] text-[13px] text-[#525252] tabular-nums">
            <span className="flex-1">Showing {(pg * PAGE + 1).toLocaleString()}–{Math.min(matched.length, pg * PAGE + PAGE).toLocaleString()} of {matched.length.toLocaleString()}</span>
            <button type="button" disabled={pg === 0} className="h-8 px-3 text-[#0f62fe] disabled:text-[#c6c6c6] hover:bg-[#e8e8e8]" onClick={() => setPage(pg - 1)}>Previous</button>
            <span>Page {pg + 1} of {pages}</span>
            <button type="button" disabled={pg >= pages - 1} className="h-8 px-3 text-[#0f62fe] disabled:text-[#c6c6c6] hover:bg-[#e8e8e8]" onClick={() => setPage(pg + 1)}>Next</button>
          </div>
        )}
        <button type="button" className="h-10 px-4 text-[14px] text-[#0f62fe] hover:bg-[#f4f4f4] w-full text-left flex items-center gap-1 border-t border-[#e0e0e0]" onClick={addRow}>
          <Plus className="h-4 w-4" /> Add line
        </button>
      </div>
      {findings.length > 0 && (
        <div className="space-y-1">
          {findings.map((f, i) => (
            <div key={i} className={`border-l-4 px-4 py-2 text-[14px] ${f.kind === 'gap' ? 'border-[#da1e28] bg-[#fff1f1] text-[#a2191f]' : 'border-[#f1c21b] bg-[#fcf4d6] text-[#684e00]'}`}>{f.text}</div>
          ))}
        </div>
      )}
    </div>
  );
}
