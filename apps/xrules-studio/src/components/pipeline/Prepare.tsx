'use client';
// Data Set › Prepare — profile the active snapshot, then build preparation steps (TOR 4.13.1.1–4.13.1.3):
// outliers (IQR / z-score: remove, clip, flag) · Min-Max / Standard / Robust scaling · centering · derived columns ·
// drop / keep columns · fill missing values. Preview first, then Apply writes a new snapshot (older ones stay).
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import { Panel, Table, Td, Tag, Btn, Input, Notice } from './ui';
import { Dropdown } from './Dropdown';

const OPS = [
  { value: 'outliers', label: 'Outliers', hint: 'remove / clip / flag' },
  { value: 'minmax', label: 'Min-Max scaling', hint: '0 to 1' },
  { value: 'standard', label: 'Standard scaling', hint: 'mean 0, sd 1' },
  { value: 'robust', label: 'Robust scaling', hint: 'median / IQR' },
  { value: 'center', label: 'Centering', hint: 'subtract mean' },
  { value: 'fillna', label: 'Fill missing', hint: 'mean / median / zero' },
  { value: 'derive', label: 'New column', hint: 'formula' },
  { value: 'drop', label: 'Remove columns' },
  { value: 'keep', label: 'Keep only columns' },
];
const opLabel = (op: string) => OPS.find(o => o.value === op)?.label ?? op;
const fmt = (v: any) => typeof v === 'number' ? (Math.abs(v) >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : Number(v.toFixed(4)).toString()) : v ?? '—';

function ColumnPicker({ columns, value, onChange, numericOnly, profile }: { columns: string[]; value: string[]; onChange: (v: string[]) => void; numericOnly?: boolean; profile?: any }) {
  const isNum = (c: string) => !profile || profile.columns.find((x: any) => x.name === c)?.type === 'number';
  return (
    <div className="flex flex-wrap gap-1.5">
      {columns.filter(c => !numericOnly || isNum(c)).map(c => {
        const on = value.includes(c);
        return <button key={c} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter(x => x !== c) : [...value, c])}
          className={`h-8 px-3 text-[13px] font-mono border ${on ? 'bg-[#0f62fe] text-white border-[#0f62fe]' : 'bg-white text-[#161616] border-[#c6c6c6] hover:bg-[#e8e8e8]'}`}>{c}</button>;
      })}
    </div>
  );
}

export function PreparePanel({ datasetId, columns, onApplied }: { datasetId: string; columns: string[]; onApplied?: (r: any) => void }) {
  const qc = useQueryClient();
  const [target, setTarget] = useState('');
  const [steps, setSteps] = useState<any[]>([]);
  const [draft, setDraft] = useState<any>({ op: 'outliers', columns: [], method: 'iqr', action: 'remove' });
  const profile = useMutation({ mutationFn: () => api.post<any>(`/data/datasets/${datasetId}/profile`, { target: target || undefined }) });
  const preview = useMutation({ mutationFn: () => api.post<any>(`/data/datasets/${datasetId}/prepare`, { steps, preview: true }) });
  const apply = useMutation({ mutationFn: () => api.post<any>(`/data/datasets/${datasetId}/prepare`, { steps }), onSuccess: (r: any) => { onApplied?.(r); qc.invalidateQueries({ queryKey: ['dataset-snaps', datasetId] }); setSteps([]); preview.reset(); } });
  const p = profile.data;
  const cols = preview.data?.columns ?? columns;
  const needsCols = !['derive'].includes(draft.op);
  const canAdd = draft.op === 'derive' ? !!draft.name && !!draft.expr : draft.columns.length > 0;
  const describe = (s: any) => s.op === 'derive' ? `${s.name} = ${s.expr}` : `${s.columns.join(', ')}${s.op === 'outliers' ? ` · ${s.method} · ${s.action}` : s.op === 'fillna' ? ` · ${s.method}` : ''}`;

  return (
    <div className="space-y-4">
      <Panel title="Profile" actions={<>
        <div className="w-56"><Dropdown value={target} onChange={setTarget} placeholder="Target column (optional)" options={[{ value: '', label: 'No target' }, ...columns.map(c => ({ value: c, label: c }))]} /></div>
        <Btn kind="tertiary" onClick={() => profile.mutate()} disabled={profile.isPending}>Analyse</Btn></>}>
        {profile.error && <Notice kind="error">{(profile.error as any).message}</Notice>}
        {!p && !profile.error && <div className="text-[14px] text-[#525252]">Statistics, outliers and relationships of the active snapshot</div>}
        {p && <div className="space-y-4">
          <Table head={['Column', 'Type', 'Missing', 'Min', 'Max', 'Mean', 'Std', 'Outliers']}>
            {p.columns.map((c: any) => (
              <tr key={c.name}><Td mono>{c.name}</Td><Td>{c.type}</Td><Td mono>{c.missing}</Td><Td mono>{fmt(c.min)}</Td><Td mono>{fmt(c.max)}</Td><Td mono>{fmt(c.mean)}</Td><Td mono>{fmt(c.std)}</Td>
                <Td>{c.outliers ? <Tag tone="orange">{c.outliers}</Tag> : c.type === 'number' ? '0' : '—'}</Td></tr>
            ))}
          </Table>
          {p.relevance && <div>
            <div className="text-[14px] font-semibold mb-2">Relationship to {target}</div>
            <div className="space-y-1">{p.relevance.map((r: any) => {
              const max = p.relevance[0].score || 1;
              return <div key={r.feature} className="grid grid-cols-[160px_1fr_70px] items-center gap-3 text-[13px]"><span className="font-mono truncate">{r.feature}</span>
                <span className="h-3 bg-[#e0e0e0]"><span className="block h-3 bg-[#0f62fe]" style={{ width: `${(r.score / max) * 100}%` }} /></span><span className="font-mono text-right">{fmt(r.score)}</span></div>;
            })}</div>
          </div>}
          {p.correlation.columns.length > 1 && <div className="overflow-x-auto">
            <div className="text-[14px] font-semibold mb-2">Correlation</div>
            <table className="text-[12px] font-mono"><thead><tr><th />{p.correlation.columns.map((c: string) => <th key={c} className="px-2 py-1 text-left font-normal text-[#525252]">{c}</th>)}</tr></thead>
              <tbody>{p.correlation.matrix.map((row: number[], i: number) => <tr key={i}><th className="pr-2 py-1 text-left font-normal text-[#525252]">{p.correlation.columns[i]}</th>
                {row.map((v, j) => <td key={j} className="px-2 py-1 text-center" style={{ background: v === null ? '#fff' : v >= 0 ? `rgba(15,98,254,${Math.abs(v) * 0.6})` : `rgba(218,30,40,${Math.abs(v) * 0.6})`, color: Math.abs(v ?? 0) > 0.6 ? '#fff' : '#161616' }}>{v === null ? '' : v.toFixed(2)}</td>)}</tr>)}</tbody></table>
          </div>}
        </div>}
      </Panel>

      <Panel title="Preparation steps">
        <div className="space-y-3">
          {steps.length > 0 && <ol className="space-y-1">{steps.map((s, i) => (
            <li key={i} className="flex items-center gap-3 h-10 px-3 bg-[#f4f4f4] text-[14px]"><span className="text-[#525252] w-5">{i + 1}</span><span className="font-semibold w-44">{opLabel(s.op)}</span><span className="font-mono text-[13px] flex-1 truncate">{describe(s)}</span>
              <button aria-label={`Remove step ${i + 1}`} className="h-8 w-8 flex items-center justify-center hover:bg-[#e0e0e0]" onClick={() => setSteps(steps.filter((_, k) => k !== i))}><X className="h-4 w-4" /></button></li>
          ))}</ol>}
          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3 items-start">
            <div><div className="text-[12px] text-[#525252] mb-1.5">Step</div><Dropdown value={draft.op} onChange={op => setDraft({ op, columns: [], method: op === 'fillna' ? 'median' : 'iqr', action: 'remove' })} options={OPS} /></div>
            <div className="space-y-3">
              {needsCols && <div><div className="text-[12px] text-[#525252] mb-1.5">Columns</div>
                <ColumnPicker columns={cols} value={draft.columns} onChange={v => setDraft({ ...draft, columns: v })} numericOnly={!['drop', 'keep'].includes(draft.op)} profile={p} /></div>}
              {draft.op === 'outliers' && <div className="grid grid-cols-2 gap-3 max-w-md">
                <div><div className="text-[12px] text-[#525252] mb-1.5">Detect by</div><Dropdown value={draft.method} onChange={v => setDraft({ ...draft, method: v })} options={[{ value: 'iqr', label: 'IQR (1.5×)' }, { value: 'zscore', label: 'z-score (3σ)' }]} /></div>
                <div><div className="text-[12px] text-[#525252] mb-1.5">Then</div><Dropdown value={draft.action} onChange={v => setDraft({ ...draft, action: v })} options={[{ value: 'remove', label: 'Remove rows' }, { value: 'clip', label: 'Clip to limits' }, { value: 'flag', label: 'Flag only' }]} /></div>
              </div>}
              {draft.op === 'fillna' && <div className="max-w-xs"><div className="text-[12px] text-[#525252] mb-1.5">Fill with</div><Dropdown value={draft.method} onChange={v => setDraft({ ...draft, method: v })} options={[{ value: 'median', label: 'Median' }, { value: 'mean', label: 'Mean' }, { value: 'zero', label: 'Zero' }]} /></div>}
              {draft.op === 'derive' && <div className="grid grid-cols-[200px_1fr] gap-3">
                <Input id="pr-name" label="Column name" mono value={draft.name} onChange={(v: string) => setDraft({ ...draft, name: v })} placeholder="perUnit" />
                <Input id="pr-expr" label="Formula" mono value={draft.expr} onChange={(v: string) => setDraft({ ...draft, expr: v })} placeholder="amount / qty" />
              </div>}
              <Btn kind="tertiary" onClick={() => { setSteps([...steps, draft]); setDraft({ ...draft, columns: [], name: '', expr: '' }); preview.reset(); }} disabled={!canAdd}>Add step</Btn>
            </div>
          </div>
          <div className="flex gap-2 pt-2 border-t border-[#e0e0e0]">
            <Btn kind="secondary" onClick={() => preview.mutate()} disabled={!steps.length || preview.isPending}>Preview result</Btn>
            <Btn onClick={() => apply.mutate()} disabled={!steps.length || apply.isPending}>Apply as new snapshot</Btn>
          </div>
          {(preview.error || apply.error) && <Notice kind="error">{((preview.error || apply.error) as any).message}</Notice>}
        </div>
      </Panel>

      {preview.data && <Panel title={`Preview · ${preview.data.total.toLocaleString()} rows after preparation`}>
        {preview.data.fitted.length > 0 && <div className="mb-3 text-[13px] text-[#525252] space-y-0.5">{preview.data.fitted.map((f: any, i: number) => (
          <div key={i} className="font-mono">{f.op === 'outliers' ? `${f.column}: ${f.found} outside ${fmt(f.low)} … ${fmt(f.high)} → ${f.action}` : `${opLabel(f.op)} ${f.columns.join(', ')}${f.data_min ? ` · min ${f.data_min.map(fmt).join('/')} max ${f.data_max.map(fmt).join('/')}` : f.mean ? ` · mean ${f.mean.map(fmt).join('/')}` : ''}`}</div>
        ))}</div>}
        <Table head={preview.data.columns}>
          {preview.data.rows.slice(0, 20).map((r: any, i: number) => <tr key={i}>{preview.data.columns.map((c: string) => <Td key={c} mono>{fmt(r[c])}</Td>)}</tr>)}
        </Table>
      </Panel>}
    </div>
  );
}
