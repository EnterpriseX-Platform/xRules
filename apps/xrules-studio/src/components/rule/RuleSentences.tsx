'use client';
// A decision table read and edited as business sentences:
//   1  If monthly income is less than 15,000 THB then approved limit = 0 THB
// Same definition as the table view ({ inputs, outputs, rules }); only the presentation differs.
import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Dropdown } from '@/components/pipeline/Dropdown';
import { parseCellExpression, formatCellExpression } from './operators';
import { tableChecks } from './tableChecks';
import { showValue, type Term } from '@/lib/terms';
import { FmtInput } from '@/components/ui/FmtInput';

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
  { value: '!NULL', label: 'is not empty', args: 0 },
];

type Def = { hitPolicy?: string; inputs?: any[]; outputs?: any[]; rules?: any[] };
const isAny = (cell: any) => { const o = parseCellExpression(cell).operator; return o === 'ANY' || o === 'ELSE'; };
const nid = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

function Chip({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center h-8 px-1 border-b-2 border-[#0f62fe] text-[#0f62fe] ${className}`}>{children}</span>;
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

export function RuleSentences({ def, onChange, label, term, terms, onAddTerm, reasons = [] }: {
  def: Def; onChange: (d: Def) => void; label: (path: string) => string; term: (path: string) => Term | undefined; terms: Term[];
  onAddTerm?: (name: string) => Promise<string | null>; reasons?: Reason[];
}) {
  const inputs: any[] = def.inputs || []; const outputs: any[] = def.outputs || []; const rules: any[] = def.rules || [];
  // which picker is open: "and" on the main group, "or" for a new group, a group index, a result or a reason
  const [adding, setAdding] = useState<{ ri: number; to: 'and' | 'or' | number | 'result' | 'reason' } | null>(null);
  const emit = (p: Partial<Def>) => onChange({ ...def, ...p });
  const setCell = (ri: number, side: 'inputs' | 'outputs', ci: number, v: any) =>
    emit({ rules: rules.map((r, i) => (i === ri ? { ...r, [side]: Object.assign([...(r[side] || [])], { [ci]: v }) } : r)) });
  const setRow = (ri: number, p: any) => emit({ rules: rules.map((r, i) => (i === ri ? { ...r, ...p } : r)) });
  const fmt = (name: string, n: number) => showValue(n, term(name));
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
      if (to === 'and') return { ...r, inputs: Object.assign([...r.inputs], { [ci]: '= ' }) };
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
        <Chip>{label(name)}</Chip>
        <span className="inline-block min-w-[96px] [&_button]:h-8 [&_button]:border-0 [&_button]:border-b-2 [&_button]:border-[#0f62fe] [&_button]:bg-transparent [&_button]:text-[#0f62fe] [&_button]:text-[15px]">
          <Dropdown value={spec.value} options={OP_TH.map(o => ({ value: o.value, label: o.label }))}
            onChange={op => put(op, OP_TH.find(o => o.value === op)!.args === 2 ? [args[0] ?? '', args[1] ?? ''] : [args[0] ?? ''])} />
        </span>
        {spec.args >= 1 && (t?.type === 'enum' && t.values?.length && spec.args === 1 && (operator === '=' || operator === '!=')
          ? <span className="inline-block min-w-[120px]"><Dropdown value={String(args[0] ?? '')} placeholder="Choose" options={t.values.map(v => ({ value: v, label: v }))} onChange={v => put(operator, [v])} /></span>
          : <FmtInput className={`${plain} text-right`} value={args[0] ?? ''} aria-label={`${label(name)} value`} onChange={v => put(operator, spec.args === 2 ? [v, args[1] ?? ''] : [v])} />)}
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
      <div className="bg-white border border-[#e0e0e0]">
        {rules.map((r, ri) => {
          const conds = inputs.map((c, ci) => ({ c, ci, cell: r.inputs?.[ci] })).filter(x => !isAny(x.cell));
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
              <button type="button" aria-label={`Remove rule ${ri + 1}`} className="h-8 w-8 shrink-0 flex items-center justify-center text-[#525252] hover:bg-[#e8e8e8] opacity-0 group-hover:opacity-100"
                onClick={() => emit({ rules: rules.filter((_, i) => i !== ri) })}><Trash2 className="h-4 w-4" /></button>
            </div>
          );
        })}
        <button type="button" className="h-10 px-4 text-[14px] text-[#0f62fe] hover:bg-[#f4f4f4] w-full text-left flex items-center gap-1" onClick={addRow}>
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
