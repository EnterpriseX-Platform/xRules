'use client';
// Decision table as sentences (default) or as a grid; both edit the same definition.
import { useState } from 'react';
import { TableDesigner } from './TableDesigner';
import { RuleSentences } from './RuleSentences';
import { Dropdown } from '@/components/pipeline/Dropdown';
import { useTerms } from '@/lib/terms';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useReasons } from '@/components/vocab/ReasonCodes';
import { AggregateWord, listsOf } from '@/components/vocab/AggregateWord';

const VIEW_KEY = 'xrules:table-view';
const POLICY_TH = [
  { value: 'FIRST_MATCH', label: 'First line that matches' },
  { value: 'STANDARD', label: 'Every line that matches' },
  { value: 'ARRAY', label: 'Every match, as a list' },
  { value: 'EVALUATE_ALL', label: 'Every line with its result' },
];

export function DecisionTableView({ rule, projectId, onChange }: { rule: any; projectId: string; onChange: (def: any) => void }) {
  const [view, setView] = useState<'sentence' | 'table'>(() => { try { return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'sentence'; } catch { return 'sentence'; } });
  const [def, setDef] = useState<any>(() => rule.definition || {});
  const [gen, setGen] = useState(0);   // remount the grid when the sentences changed the definition
  const fields = [...(def.inputs || []), ...(def.outputs || [])].map((c: any) => ({ path: c.name, type: c.type }));
  const { label, term, terms } = useTerms(projectId, fields);
  const change = (d: any) => { setDef(d); onChange(d); };
  const qc = useQueryClient();
  const { data: reasons = [] } = useReasons(projectId);
  const { data: versions } = useQuery({ queryKey: ['rule-versions', rule.id], queryFn: () => api.get<any[]>(`/rules/${rule.id}/versions`), enabled: !!rule.id });
  const live = (versions as any[] | undefined)?.find(v => String(v.status).toUpperCase() === 'PUBLISHED')?.definition || null;
  // a new term typed in "Choose data": its path is the name in snake case
  const addTerm = async (name: string) => {
    const path = name.trim().toLowerCase().replace(new RegExp('[^\\p{L}\\p{N}]+', 'gu'), '_').replace(/^_|_$/g, '') || `field_${Date.now().toString(36)}`;
    const t = await api.post<any>('/platform/vocabulary', { projectId, term: name.trim(), path, type: 'text' });
    await qc.invalidateQueries({ queryKey: ['vocab', projectId] });
    return t?.path || path;
  };
  const [aggOpen, setAggOpen] = useState(false);
  const lists = listsOf(terms.filter(t => !t.derived && !t.path.startsWith('@')));
  const per = def.perItem?.list || '';
  const pick = (v: 'sentence' | 'table') => { setView(v); setGen(g => g + 1); try { localStorage.setItem(VIEW_KEY, v); } catch { /* per-viewer only */ } };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {(
          <div className="w-[240px]"><Dropdown value={String(def.hitPolicy || 'STANDARD').toUpperCase() === 'FIRST' ? 'FIRST_MATCH' : String(def.hitPolicy || 'STANDARD').toUpperCase()}
            options={POLICY_TH} onChange={v => change({ ...def, hitPolicy: v })} /></div>
        )}
        {lists.length > 0 && <>
          <span className="text-[14px] text-[#525252]">Run</span>
          <div className="w-[240px]"><Dropdown value={per} onChange={v => change({ ...def, perItem: v ? { list: v, rollup: def.perItem?.rollup || 'all' } : undefined })}
            options={[{ value: '', label: 'Once for the request' }, ...lists.map(l => ({ value: l, label: `For each ${label(l)}` }))]} /></div>
          {per && <div className="w-[220px]"><Dropdown value={def.perItem?.rollup || 'all'} onChange={v => change({ ...def, perItem: { list: per, rollup: v } })}
            options={[{ value: 'all', label: 'Keep every item that matches' }, { value: 'first', label: 'Stop at the first item that matches' }]} /></div>}
          <button type="button" className="h-8 px-2 text-[14px] text-[#0f62fe] hover:underline whitespace-nowrap" onClick={() => setAggOpen(true)}>Add a total over a list</button>
        </>}
        {aggOpen && <AggregateWord projectId={projectId} onClose={() => setAggOpen(false)} />}
        <div className="flex-1" />
        <div className="flex border border-[#8d8d8d]" role="tablist" aria-label="View">
          {(['sentence', 'table'] as const).map(v => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => pick(v)}
              className={`h-8 px-4 text-[14px] ${view === v ? 'bg-[#161616] text-white' : 'text-[#161616] hover:bg-[#e8e8e8]'}`}>{v === 'sentence' ? 'Sentences' : 'Table'}</button>
          ))}
        </div>
      </div>
      {view === 'sentence'
        ? <RuleSentences def={def} onChange={change} label={label} term={term} terms={terms} onAddTerm={addTerm} reasons={reasons} live={live} />
        : <TableDesigner key={gen} definition={def} inputSchema={rule.inputSchema} outputSchema={rule.outputSchema} onChange={change} hidePolicy label={label} reasons={reasons} valuesOf={(n: string) => term(n)?.values || []} />}
    </div>
  );
}
