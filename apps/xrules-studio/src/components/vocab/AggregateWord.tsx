'use client';
// An aggregate word: sum / largest / smallest / count / average of a field over a list, with an optional filter.
// Made once (from Words or from a decision) and then used like any word. Its field may itself be an aggregate word,
// worked out per item of the outer list (largest, over bureau accounts, of the count of late payments).
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Input, Modal } from '@/components/pipeline/ui';
import { Dropdown } from '@/components/pipeline/Dropdown';
import { plainName } from '@/lib/terms';

const FNS = [{ value: 'count', label: 'Count' }, { value: 'sum', label: 'Sum' }, { value: 'max', label: 'Largest' }, { value: 'min', label: 'Smallest' }, { value: 'avg', label: 'Average' }];
const FN_WORD: Record<string, string> = { count: 'count of', sum: 'sum of', max: 'largest', min: 'smallest', avg: 'average' };

/** Every list a sample's words go through: a[], a[].b[] */
export function listsOf(terms: { path: string }[]): string[] {
  const out = new Set<string>();
  for (const t of terms) { const parts = String(t.path).split('.'); parts.forEach((s, i) => { if (s.endsWith('[]')) out.add(parts.slice(0, i + 1).join('.')); }); }
  return Array.from(out).sort();
}

export function aggregateText(a: any, label: (p: string) => string): string {
  if (!a) return '';
  const list = label(a.list) || plainName(a.list);
  const w = a.where?.field ? ` where ${label(`${a.list}.${a.where.field}`) || a.where.field} ${a.where.cell}` : '';
  return a.fn === 'count' ? `count of ${list}${w}` : `${FN_WORD[a.fn] || a.fn} ${label(a.field?.startsWith('@') ? a.field : `${a.list}.${a.field}`)} over ${list}${w}`;
}

export function AggregateWord({ projectId, onClose, onMade, word }: { projectId: string; onClose: () => void; onMade?: (path: string) => void; word?: any }) {
  const qc = useQueryClient();
  const { data: terms = [] } = useQuery({ queryKey: ['vocab', projectId], queryFn: () => api.get<any[]>(`/platform/vocabulary?project_id=${projectId}`) });
  const a = word?.aggregate || {};
  const [name, setName] = useState(word?.term || '');
  const [fn, setFn] = useState(a.fn || 'count');
  const [list, setList] = useState(a.list || '');
  const [field, setField] = useState(a.field || '');
  const [wField, setWField] = useState(a.where?.field || '');
  const [wCell, setWCell] = useState(a.where?.cell || '');
  const lists = listsOf(terms as any[]);
  const label = (p: string) => (terms as any[]).find(t => t.path === p)?.term || plainName(p);
  // fields directly on an item of the list (not inside a deeper list), and aggregate words over a deeper list
  const fields = (terms as any[]).filter(t => list && t.path.startsWith(list + '.') && !t.path.slice(list.length + 1).includes('[]') && !t.path.endsWith('[]'))
    .map(t => ({ value: t.path.slice(list.length + 1), label: t.term }));
  const nested = (terms as any[]).filter(t => t.aggregate && list && String(t.aggregate.list).startsWith(list + '.')).map(t => ({ value: t.path, label: t.term }));
  const save = useMutation({ meta: { silent: true },
    mutationFn: () => api.post<any>('/platform/vocabulary', { id: word?.id, projectId, term: name.trim(), path: word?.path || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''), type: 'number',
      aggregate: { fn, list, ...(fn !== 'count' ? { field } : {}), ...(wField && wCell.trim() ? { where: { field: wField, cell: wCell.trim() } } : {}) },
      description: aggregateText({ fn, list, field, where: wField && wCell ? { field: wField, cell: wCell } : null }, label) }),
    onSuccess: (t: any) => { qc.invalidateQueries({ queryKey: ['vocab', projectId] }); onMade?.(t.path); onClose(); } });
  return (
    <Modal title={word ? `Edit ${word.term}` : 'Add a total over a list'} wide onClose={onClose} onSubmit={() => save.mutate()} submitLabel={word ? 'Save' : 'Add'}
      submitDisabled={!name.trim() || !list || (fn !== 'count' && !field) || save.isPending} error={save.error ? String((save.error as any).message) : null}>
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div><div className="text-[12px] text-[#525252] mb-1.5">Work out</div><Dropdown value={fn} onChange={setFn} options={FNS} /></div>
          <div><div className="text-[12px] text-[#525252] mb-1.5">Over the list</div><Dropdown value={list} onChange={v => { setList(v); setField(''); setWField(''); }} options={lists.map(l => ({ value: l, label: label(l) }))} placeholder={lists.length ? 'Choose a list' : 'Import a sample with lists first'} /></div>
        </div>
        {fn !== 'count' && <div><div className="text-[12px] text-[#525252] mb-1.5">Of</div><Dropdown value={field} onChange={setField} options={[...fields, ...nested]} placeholder="Choose a field" /></div>}
        <div className="grid grid-cols-[1fr_180px] gap-4">
          <div><div className="text-[12px] text-[#525252] mb-1.5">Only items where</div><Dropdown value={wField} onChange={setWField} options={[{ value: '', label: 'Every item' }, ...fields]} /></div>
          <Input id="ag-cell" label="Is" value={wCell} onChange={setWCell} placeholder="> 30" />
        </div>
        <Input id="ag-name" label="Word" value={name} onChange={setName} placeholder={list ? aggregateText({ fn, list, field, where: wField && wCell ? { field: wField, cell: wCell } : null }, label) : 'late payments in 24 months'} />
      </div>
    </Modal>
  );
}
