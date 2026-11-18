'use client';
// Form editors for test data, so business users never have to write JSON.
// InputFields: one row per input field (name · value). ExpectationRows: one row per check.
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Dropdown } from '@/components/pipeline/Dropdown';

export type Field = { name: string; type?: string };

const isPlain = (v: any) => v === null || ['string', 'number', 'boolean'].includes(typeof v);
export const toText = (v: any) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
export function fromText(t: string, type?: string): any {
  const s = t.trim();
  if (type === 'number' || type === 'integer' || type === 'money') return s === '' ? null : (isNaN(Number(s)) ? s : Number(s));
  if (type === 'boolean') return s === 'true';
  if (type === 'string' || type === 'text') return t;
  if (s === '') return '';
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s === 'true' || s === 'false') return s === 'true';
  if (/^[\[{]/.test(s)) { try { return JSON.parse(s); } catch { /* keep text */ } }
  return t;
}

const cell = 'h-9 w-full min-w-0 bg-[#f4f4f4] border-b border-[#8d8d8d] px-3 text-[14px] outline-none focus:outline focus:outline-2 focus:outline-[#0f62fe] focus:-outline-offset-2';
const label = 'text-[12px] text-[#525252]';

function CodeToggle({ code, onToggle, disabled }: { code: boolean; onToggle: () => void; disabled?: boolean }) {
  return <button type="button" onClick={onToggle} disabled={disabled} className="text-[12px] text-[#0f62fe] hover:underline disabled:text-[#a8a8a8] disabled:no-underline">{code ? 'Fields' : 'Code'}</button>;
}

export function InputFields({ value, onChange, fields = [], title = 'Input' }: {
  value: Record<string, any>; onChange: (v: Record<string, any>) => void; fields?: Field[]; title?: string;
}) {
  const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const nested = Object.values(obj).some(v => !isPlain(v));
  const [code, setCode] = useState(nested);
  const [text, setText] = useState(() => JSON.stringify(obj, null, 2));
  const [bad, setBad] = useState(false);
  const known = new Map(fields.map(f => [f.name, f.type]));
  const keys = Array.from(new Set([...fields.map(f => f.name), ...Object.keys(obj)]));
  const [extra, setExtra] = useState<string[]>([]);
  const rows = [...keys, ...extra.filter(k => !keys.includes(k))];

  const setKey = (k: string, v: any) => onChange({ ...obj, [k]: v });
  const rename = (oldK: string, newK: string) => {
    const next: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) next[k === oldK ? newK : k] = v;
    setExtra(e => e.map(x => (x === oldK ? newK : x)));
    onChange(next);
  };
  const remove = (k: string) => { const { [k]: _, ...rest } = obj; setExtra(e => e.filter(x => x !== k)); onChange(rest); };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className={label}>{title}</span>
        <CodeToggle code={code} disabled={code && bad} onToggle={() => { if (!code) setText(JSON.stringify(obj, null, 2)); setCode(!code); }} />
      </div>
      {code ? (
        <textarea rows={8} spellCheck={false} value={text}
          className="w-full bg-[#f4f4f4] border-b border-[#8d8d8d] px-3 py-2 font-mono text-[13px] outline-none resize-y focus:outline focus:outline-2 focus:outline-[#0f62fe] focus:-outline-offset-2"
          onChange={e => { setText(e.target.value); try { const v = JSON.parse(e.target.value || '{}'); setBad(false); if (v && typeof v === 'object' && !Array.isArray(v)) onChange(v); } catch { setBad(true); } }} />
      ) : (
        <div className="space-y-1">
          {rows.map(k => {
            const t = known.get(k);
            const v = obj[k];
            return (
              <div key={k} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_32px] gap-1 items-center">
                {known.has(k)
                  ? <div className="h-9 px-3 flex items-center text-[14px] text-[#161616] truncate" title={k}>{k}</div>
                  : <input className={cell} value={k} aria-label="Field name" onChange={e => rename(k, e.target.value)} />}
                {t === 'boolean'
                  ? <Dropdown value={v === true ? 'true' : v === false ? 'false' : ''} placeholder="—" onChange={x => setKey(k, x === 'true')} options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]} />
                  : <input className={cell} value={toText(v)} inputMode={t === 'number' ? 'decimal' : undefined} aria-label={`Value of ${k}`}
                      onChange={e => setKey(k, fromText(e.target.value, t))} />}
                <button type="button" aria-label={`Remove ${k}`} onClick={() => remove(k)} disabled={known.has(k)}
                  className="h-9 w-8 flex items-center justify-center text-[#525252] hover:bg-[#e8e8e8] disabled:opacity-0"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            );
          })}
          <button type="button" className="h-8 px-2 text-[13px] text-[#0f62fe] hover:bg-[#e8e8e8] flex items-center gap-1"
            onClick={() => { let n = 'field', i = 1; while (rows.includes(n)) n = `field${++i}`; setExtra(e => [...e, n]); onChange({ ...obj, [n]: '' }); }}>
            <Plus className="h-4 w-4" /> Add field
          </button>
        </div>
      )}
    </div>
  );
}

export type Expectation = { kind: string; path?: string; value?: any; code?: string; severity?: string };
const KIND_OPTS = [
  { value: 'equals', label: 'Result is' },
  { value: 'has_finding', label: 'Finding raised' },
  { value: 'no_finding', label: 'No finding' },
  { value: 'status', label: 'Status code' },
  { value: 'max_ms', label: 'Faster than (ms)' },
];
const SEV_OPTS = [{ value: '', label: 'Any level' }, { value: 'ERROR', label: 'Error' }, { value: 'WARNING', label: 'Warning' }, { value: 'INFO', label: 'Info' }];

export function ExpectationRows({ value, onChange, outputs = [] }: { value: Expectation[]; onChange: (v: Expectation[]) => void; outputs?: string[] }) {
  const list = Array.isArray(value) ? value : [];
  const [code, setCode] = useState(false);
  const [text, setText] = useState('');
  const [bad, setBad] = useState(false);
  const upd = (i: number, p: Partial<Expectation>) => onChange(list.map((e, j) => (j === i ? { ...e, ...p } : e)));
  const blank = (kind: string): Expectation => kind === 'equals' ? { kind, path: outputs[0] || '', value: '' } : kind === 'has_finding' || kind === 'no_finding' ? { kind, code: '' } : { kind, value: kind === 'status' ? 200 : 1000 };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className={label}>Expected</span>
        <CodeToggle code={code} disabled={code && bad} onToggle={() => { if (!code) setText(JSON.stringify(list, null, 2)); setCode(!code); }} />
      </div>
      {code ? (
        <textarea rows={8} spellCheck={false} value={text}
          className="w-full bg-[#f4f4f4] border-b border-[#8d8d8d] px-3 py-2 font-mono text-[13px] outline-none resize-y focus:outline focus:outline-2 focus:outline-[#0f62fe] focus:-outline-offset-2"
          onChange={e => { setText(e.target.value); try { const v = JSON.parse(e.target.value || '[]'); setBad(false); if (Array.isArray(v)) onChange(v); } catch { setBad(true); } }} />
      ) : (
        <div className="space-y-1">
          {list.map((e, i) => (
            <div key={i} className="grid grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)_32px] gap-1 items-center">
              <Dropdown value={e.kind} options={KIND_OPTS} onChange={k => onChange(list.map((x, j) => (j === i ? blank(k) : x)))} />
              {e.kind === 'equals' && <>
                {outputs.length
                  ? <Dropdown value={e.path || ''} placeholder="Result field" options={Array.from(new Set([...outputs, ...(e.path ? [e.path] : [])])).map(o => ({ value: o, label: o }))} onChange={p => upd(i, { path: p })} />
                  : <input className={cell} value={e.path || ''} placeholder="Result field" aria-label="Result field" onChange={x => upd(i, { path: x.target.value })} />}
                <input className={cell} value={toText(e.value)} placeholder="Value" aria-label="Expected value" onChange={x => upd(i, { value: fromText(x.target.value) })} />
              </>}
              {(e.kind === 'has_finding' || e.kind === 'no_finding') && <>
                <input className={cell} value={e.code || ''} placeholder="Code" aria-label="Finding code" onChange={x => upd(i, { code: x.target.value })} />
                {e.kind === 'has_finding' ? <Dropdown value={e.severity || ''} options={SEV_OPTS} onChange={s => upd(i, { severity: s || undefined })} /> : <span />}
              </>}
              {(e.kind === 'status' || e.kind === 'max_ms') && <>
                <input className={cell} value={toText(e.value)} inputMode="numeric" aria-label="Value" onChange={x => upd(i, { value: fromText(x.target.value, 'number') })} />
                <span />
              </>}
              <button type="button" aria-label="Remove check" onClick={() => onChange(list.filter((_, j) => j !== i))}
                className="h-9 w-8 flex items-center justify-center text-[#525252] hover:bg-[#e8e8e8]"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <button type="button" className="h-8 px-2 text-[13px] text-[#0f62fe] hover:bg-[#e8e8e8] flex items-center gap-1" onClick={() => onChange([...list, blank('equals')])}>
            <Plus className="h-4 w-4" /> Add check
          </button>
        </div>
      )}
    </div>
  );
}

// Field names a rule or flow takes / returns, read from its definition or schema.
export function inputFieldsOf(item: any): Field[] {
  if (!item) return [];
  const defIn = item.definition?.inputs;
  if (Array.isArray(defIn) && defIn.length) return defIn.map((i: any) => ({ name: i.name, type: i.type }));
  const props = item.inputSchema?.properties || item.input_schema?.properties;
  if (props) return Object.entries(props).map(([name, p]: any) => ({ name, type: p?.type }));
  return [];
}
export function outputFieldsOf(item: any): string[] {
  if (!item) return [];
  const defOut = item.definition?.outputs;
  if (Array.isArray(defOut) && defOut.length) return defOut.map((o: any) => o.name);
  const props = item.outputSchema?.properties || item.output_schema?.properties;
  return props ? Object.keys(props) : [];
}

// A decision flow takes the inputs of the rules it calls and returns each rule's outputs under its "save as" name.
export function flowFields(flow: any, rules: any[]): { inputs: Field[]; outputs: string[] } {
  const nodes: any[] = flow?.graph?.nodes || flow?.definition?.nodes || [];
  const inputs = new Map<string, Field>(); const outputs: string[] = [];
  for (const n of nodes) {
    const d = n.data || {};
    if (!(n.type === 'ruleCall' || d.ruleSlug || d.ruleId)) continue;
    const r = rules.find(x => x.slug === d.ruleSlug || x.id === d.ruleId || x.alias === d.ruleSlug);
    for (const f of inputFieldsOf(r)) if (!inputs.has(f.name)) inputs.set(f.name, f);
    for (const o of outputFieldsOf(r)) outputs.push(d.outputAs ? `${d.outputAs}.${o}` : o);
  }
  return { inputs: Array.from(inputs.values()), outputs };
}

// Result as rows (field · value); nested objects are flattened to a.b.c. "Code" shows the raw JSON.
export function ResultView({ value }: { value: any }) {
  const [code, setCode] = useState(false);
  const rows: [string, any][] = [];
  const walk = (v: any, p: string) => {
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) Object.entries(v).forEach(([k, x]) => walk(x, p ? `${p}.${k}` : k));
    else rows.push([p || 'result', v]);
  };
  walk(value, '');
  return (
    <div>
      <div className="flex justify-end mb-1"><CodeToggle code={code} onToggle={() => setCode(!code)} /></div>
      {code
        ? <pre className="font-mono text-[12px] text-[#161616] whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
        : <div className="border-t border-[#e0e0e0]">{rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 px-1 py-2 border-b border-[#e0e0e0] text-[14px]">
              <span className="text-[#525252] truncate" title={k}>{k}</span>
              <span className="text-[#161616] break-words">{v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : typeof v === 'number' ? v.toLocaleString('en-US') : String(v)}</span>
            </div>))}</div>}
    </div>
  );
}
