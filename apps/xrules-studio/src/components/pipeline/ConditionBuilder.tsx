'use client';
// Branch condition as rows of field · operator · value. Writes the same expression string the runtime evaluates.
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Dropdown } from './Dropdown';

type Row = { field: string; op: string; value: string };
const OPS = [
  { value: '===', label: '=' }, { value: '!==', label: '≠' },
  { value: '>', label: '>' }, { value: '>=', label: '≥' },
  { value: '<', label: '<' }, { value: '<=', label: '≤' },
];
const RE = /^\s*([A-Za-z_$][\w.$\[\]]*)\s*(===|!==|==|!=|>=|<=|>|<)\s*(.+?)\s*$/;

function fmt(v: string) {
  const t = v.trim();
  if (t === '') return '""';
  if (/^-?\d+(\.\d+)?$/.test(t) || t === 'true' || t === 'false' || t === 'null') return t;
  if (/^".*"$|^'.*'$/.test(t)) return t;
  return JSON.stringify(t);
}
function unfmt(v: string) {
  const t = v.trim();
  if (/^".*"$/.test(t)) { try { return JSON.parse(t); } catch { /* keep */ } }
  if (/^'.*'$/.test(t)) return t.slice(1, -1);
  return t;
}

export function parseCondition(s: string): { join: '&&' | '||'; rows: Row[] } | null {
  const src = (s || '').trim();
  if (!src) return { join: '&&', rows: [{ field: '', op: '>', value: '' }] };
  const join = src.includes('||') ? '||' : '&&';
  if (src.includes('&&') && src.includes('||')) return null;
  const parts = src.split(join === '&&' ? '&&' : '||');
  const rows: Row[] = [];
  for (const p of parts) {
    const m = p.match(RE);
    if (!m || /[()]/.test(p)) return null;
    rows.push({ field: m[1], op: m[2] === '==' ? '===' : m[2] === '!=' ? '!==' : m[2], value: unfmt(m[3]) });
  }
  return { join, rows };
}
export function buildCondition(join: string, rows: Row[]) {
  return rows.filter(r => r.field.trim()).map(r => `${r.field.trim()} ${r.op} ${fmt(r.value)}`).join(` ${join} `);
}

export function ConditionBuilder({ value, onChange, fields = [] }: { value: string; onChange: (v: string) => void; fields?: string[] }) {
  const parsed = parseCondition(value);
  const [code, setCode] = useState(!parsed);
  const [state, setState] = useState(parsed || { join: '&&' as const, rows: [{ field: '', op: '>', value: '' }] });
  const push = (next: typeof state) => { setState(next); onChange(buildCondition(next.join, next.rows)); };
  const upd = (i: number, p: Partial<Row>) => push({ ...state, rows: state.rows.map((r, j) => (j === i ? { ...r, ...p } : r)) });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-[#525252]">Condition</span>
        <button type="button" className="text-[12px] text-[#0f62fe] hover:underline"
          onClick={() => { if (code) { const p = parseCondition(value); if (p) { setState(p); setCode(false); } } else setCode(true); }}
          disabled={code && !parseCondition(value)}>
          {code ? 'Fields' : 'Code'}
        </button>
      </div>
      {code ? (
        <input className="input w-full font-mono text-[13px]" value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder="input.amount > 10000" />
      ) : <>
        {state.rows.map((r, i) => (
          <div key={i} className="space-y-1">
            {i > 0 && (
              <div className="flex gap-1 py-1">
                {(['&&', '||'] as const).map(j => (
                  <button key={j} type="button" onClick={() => push({ ...state, join: j })}
                    className={`h-6 px-2 text-[12px] border ${state.join === j ? 'bg-[#161616] text-white border-[#161616]' : 'border-[#c6c6c6] text-[#525252] hover:bg-[#f4f4f4]'}`}>
                    {j === '&&' ? 'and' : 'or'}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-[1fr_64px_1fr_28px] gap-1 items-center">
              <input className="input w-full font-mono text-[12px] min-w-0" value={r.field} placeholder="input.amount" onChange={e => upd(i, { field: e.target.value })} aria-label="Field" />
              <Dropdown value={r.op} onChange={v => upd(i, { op: v })} options={OPS} />
              <input className="input w-full font-mono text-[12px] min-w-0" value={r.value} placeholder="10000" onChange={e => upd(i, { value: e.target.value })} aria-label="Value" />
              <button type="button" className="h-8 w-7 flex items-center justify-center text-[#525252] hover:bg-[#e8e8e8] disabled:opacity-30" aria-label="Remove"
                disabled={state.rows.length === 1} onClick={() => push({ ...state, rows: state.rows.filter((_, j) => j !== i) })}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
        {fields.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {fields.map(f => (
              <button key={f} type="button" className="h-6 px-1.5 font-mono text-[11px] text-[#525252] border border-[#e0e0e0] hover:bg-[#f4f4f4]"
                onClick={() => { const i = state.rows.findIndex(r => !r.field.trim()); upd(i < 0 ? state.rows.length - 1 : i, { field: f }); }}>{f}</button>
            ))}
          </div>
        )}
        <button type="button" className="h-8 px-2 text-[13px] text-[#0f62fe] hover:bg-[#e8e8e8] flex items-center gap-1"
          onClick={() => push({ ...state, rows: [...state.rows, { field: '', op: '>', value: '' }] })}>
          <Plus className="h-4 w-4" /> Add condition
        </button>
      </>}
    </div>
  );
}
