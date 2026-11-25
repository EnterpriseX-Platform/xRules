'use client';
// A decision table read and edited as business sentences:
//   1  ถ้า รายได้ต่อเดือน น้อยกว่า 15,000 บาท แล้ว วงเงินอนุมัติ = 0 บาท
// Same definition as the table view ({ inputs, outputs, rules }); only the presentation differs.
import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Dropdown } from '@/components/pipeline/Dropdown';
import { parseCellExpression, formatCellExpression } from './operators';
import { tableChecks } from './tableChecks';
import { showValue, type Term } from '@/lib/terms';
import { FmtInput } from '@/components/ui/FmtInput';

export const OP_TH: { value: string; label: string; args: 0 | 1 | 2 }[] = [
  { value: '=', label: 'เท่ากับ', args: 1 },
  { value: '!=', label: 'ไม่เท่ากับ', args: 1 },
  { value: '<', label: 'น้อยกว่า', args: 1 },
  { value: '<=', label: 'ไม่เกิน', args: 1 },
  { value: '>', label: 'มากกว่า', args: 1 },
  { value: '>=', label: 'ตั้งแต่', args: 1 },
  { value: 'BTW', label: 'ระหว่าง', args: 2 },
  { value: 'IN', label: 'เป็นหนึ่งใน', args: 1 },
  { value: '!IN', label: 'ไม่ใช่', args: 1 },
  { value: 'NULL', label: 'ว่าง', args: 0 },
  { value: '!NULL', label: 'ไม่ว่าง', args: 0 },
];

type Def = { hitPolicy?: string; inputs?: any[]; outputs?: any[]; rules?: any[] };
const isAny = (cell: any) => parseCellExpression(cell).operator === 'ANY';
const nid = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

function Chip({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center h-8 px-1 border-b-2 border-[#0f62fe] text-[#0f62fe] ${className}`}>{children}</span>;
}
const plain = 'h-8 bg-transparent outline-none border-b-2 border-[#0f62fe] text-[#0f62fe] px-1 text-[15px] focus:bg-[#edf5ff]';

export function RuleSentences({ def, onChange, label, term, terms }: {
  def: Def; onChange: (d: Def) => void; label: (path: string) => string; term: (path: string) => Term | undefined; terms: Term[];
}) {
  const inputs: any[] = def.inputs || []; const outputs: any[] = def.outputs || []; const rules: any[] = def.rules || [];
  const [adding, setAdding] = useState<number | null>(null);
  const emit = (p: Partial<Def>) => onChange({ ...def, ...p });
  const setCell = (ri: number, side: 'inputs' | 'outputs', ci: number, v: any) =>
    emit({ rules: rules.map((r, i) => (i === ri ? { ...r, [side]: Object.assign([...(r[side] || [])], { [ci]: v }) } : r)) });
  const fmt = (name: string, n: number) => showValue(n, term(name));
  const findings = useMemo(() => tableChecks(def, label, fmt), [def, label]); // eslint-disable-line react-hooks/exhaustive-deps

  function addRow() {
    const blank = { id: nid(), inputs: inputs.map(() => '-'), outputs: outputs.map(() => null) };
    const last = rules[rules.length - 1];
    const catchAll = last && (last.inputs || []).every(isAny);
    emit({ rules: catchAll ? [...rules.slice(0, -1), blank, last] : [...rules, blank] });
  }
  // add a condition on a field: an existing column whose cell is "any", or a new column from the vocabulary
  function addCondition(ri: number, path: string) {
    setAdding(null);
    let ci = inputs.findIndex(c => c.name === path);
    let nextInputs = inputs, nextRules = rules;
    if (ci < 0) {
      const t = term(path);
      nextInputs = [...inputs, { name: path, type: t?.type === 'money' ? 'number' : (t?.type || 'string'), label: t?.term }];
      nextRules = rules.map(r => ({ ...r, inputs: [...(r.inputs || []), '-'] }));
      ci = nextInputs.length - 1;
    }
    nextRules = nextRules.map((r, i) => (i === ri ? { ...r, inputs: Object.assign([...r.inputs], { [ci]: '= ' }) } : r));
    onChange({ ...def, inputs: nextInputs, rules: nextRules });
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#e0e0e0]">
        {rules.map((r, ri) => {
          const conds = inputs.map((c, ci) => ({ c, ci, cell: r.inputs?.[ci] })).filter(x => !isAny(x.cell));
          const free = inputs.filter((_, ci) => isAny(r.inputs?.[ci])).map(c => c.name);
          const more = terms.filter(t => !inputs.some(c => c.name === t.path) && !outputs.some(o => o.name === t.path)).map(t => t.path);
          return (
            <div key={r.id || ri} className="group flex items-start gap-3 px-4 py-2 border-b border-[#e0e0e0] last:border-b-0 text-[15px] text-[#161616] leading-8">
              <span className="w-6 shrink-0 text-right text-[13px] text-[#6f6f6f] tabular-nums pt-px">{ri + 1}</span>
              <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-1.5">
                {conds.length === 0 ? <span>กรณีอื่น</span> : <span>ถ้า</span>}
                {conds.map(({ c, ci, cell }, k) => {
                  const { operator, args } = parseCellExpression(cell);
                  const spec = OP_TH.find(o => o.value === operator) || OP_TH[0];
                  const t = term(c.name);
                  const set = (op: string, a: any[]) => setCell(ri, 'inputs', ci, formatCellExpression(op, a));
                  return (
                    <span key={ci} className="inline-flex flex-wrap items-center gap-x-1.5">
                      {k > 0 && <span>และ</span>}
                      <Chip>{label(c.name)}</Chip>
                      <span className="inline-block min-w-[96px] [&_button]:h-8 [&_button]:border-0 [&_button]:border-b-2 [&_button]:border-[#0f62fe] [&_button]:bg-transparent [&_button]:text-[#0f62fe] [&_button]:text-[15px]">
                        <Dropdown value={spec.value} options={OP_TH.map(o => ({ value: o.value, label: o.label }))}
                          onChange={op => set(op, OP_TH.find(o => o.value === op)!.args === 2 ? [args[0] ?? '', args[1] ?? ''] : [args[0] ?? ''])} />
                      </span>
                      {spec.args >= 1 && (t?.type === 'enum' && t.values?.length && spec.args === 1 && (operator === '=' || operator === '!=')
                        ? <span className="inline-block min-w-[120px]"><Dropdown value={String(args[0] ?? '')} placeholder="เลือก" options={t.values.map(v => ({ value: v, label: v }))} onChange={v => set(operator, [v])} /></span>
                        : <FmtInput className={`${plain} text-right`} value={args[0] ?? ''} aria-label={`${label(c.name)} value`} onChange={v => set(operator, spec.args === 2 ? [v, args[1] ?? ''] : [v])} />)}
                      {spec.args === 2 && <><span>ถึง</span><FmtInput className={`${plain} text-right`} value={args[1] ?? ''} aria-label={`${label(c.name)} to`} onChange={v => set(operator, [args[0] ?? '', v])} /></>}
                      {spec.args >= 1 && t?.unit && <span className="text-[#525252]">{t.unit}</span>}
                      <button type="button" aria-label="Remove condition" className="h-6 w-6 text-[#8d8d8d] hover:text-[#da1e28] opacity-0 group-hover:opacity-100" onClick={() => setCell(ri, 'inputs', ci, '-')}>×</button>
                    </span>
                  );
                })}
                {adding === ri ? (
                  <span className="inline-block min-w-[180px]"><Dropdown value="" placeholder="เลือกข้อมูล"
                    options={[...free, ...more].map(p => ({ value: p, label: label(p) }))} onChange={p => p && addCondition(ri, p)} /></span>
                ) : (
                  <button type="button" className="h-8 px-1 text-[13px] text-[#0f62fe] hover:underline" onClick={() => setAdding(ri)}>{conds.length ? '+ และ' : '+ เงื่อนไข'}</button>
                )}
                <span className="mx-1">แล้ว</span>
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
              </div>
              <button type="button" aria-label={`Remove rule ${ri + 1}`} className="h-8 w-8 shrink-0 flex items-center justify-center text-[#525252] hover:bg-[#e8e8e8] opacity-0 group-hover:opacity-100"
                onClick={() => emit({ rules: rules.filter((_, i) => i !== ri) })}><Trash2 className="h-4 w-4" /></button>
            </div>
          );
        })}
        <button type="button" className="h-10 px-4 text-[14px] text-[#0f62fe] hover:bg-[#f4f4f4] w-full text-left flex items-center gap-1" onClick={addRow}>
          <Plus className="h-4 w-4" /> เพิ่มข้อ
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
