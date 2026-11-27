'use client';
// A "steps" topic: ordered, named stages (Policy → Income → … → Final), each holding decisions and calculations.
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { api, rulesApi } from '@/lib/api';
import { kindName } from '@/lib/kinds';
import { Btn, Input, Modal } from '@/components/pipeline/ui';
import { Dropdown } from '@/components/pipeline/Dropdown';
import { Chip } from '@/components/links/Links';

export type Stage = { id: string; name: string; items: string[] };
const isCalc = (d: any) => d.question === 'amount';
export const stageCounts = (st: Stage, ds: any[]) => {
  const items = st.items.map(i => ds.find(d => d.id === i)).filter(Boolean);
  const c = items.filter(isCalc).length, n = items.length - c;
  return [n ? `${n} decision${n === 1 ? '' : 's'}` : '', c ? `${c} calculation${c === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ') || 'Empty';
};
const href = (projectId: string, d: any) => d.kind === 'flow' ? `/p/${projectId}/flows/${d.id}` : `/p/${projectId}/rules/${d.id}`;

/** Overview: the stages in order with their counts and what each holds. */
export function StagesOverview({ projectId, topic, onTab }: { projectId: string; topic: any; onTab: (k: any) => void }) {
  const ds: any[] = topic.decisions || []; const stages: Stage[] = topic.stages || [];
  return (
    <ol className="m-0 p-0 list-none bg-white border border-[#e0e0e0]">
      {stages.map((st, i) => (
        <li key={st.id} className="grid grid-cols-[48px_minmax(0,1fr)_200px] items-center min-h-[64px] border-t border-[#e0e0e0] first:border-t-0">
          <span className="self-stretch flex items-center justify-center text-[14px] text-[#525252] border-r border-[#e0e0e0]">{i + 1}</span>
          <div className="px-4 py-3 min-w-0">
            <div className="text-[15px] text-[#161616]">{st.name}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{st.items.map(id => ds.find(d => d.id === id)).filter(Boolean).map((d: any) => <Chip key={d.id} item={{ kind: isCalc(d) ? 'amount' : 'qualify', id: d.id, name: d.name, href: href(projectId, d) }} />)}</div>
          </div>
          <div className="px-4 text-right text-[13px] text-[#525252]">{stageCounts(st, ds)}</div>
        </li>
      ))}
      {!stages.length && <li className="px-5 py-8 text-[14px]"><button className="text-[#0f62fe]" onClick={() => onTab('steps')}>Add a step</button></li>}
    </ol>
  );
}

/** The Steps tab: rename, reorder, add and remove steps; create or place decisions in a step. */
export function StagesEditor({ projectId, topic, canWrite }: { projectId: string; topic: any; canWrite: boolean }) {
  const qc = useQueryClient(); const router = useRouter();
  const ds: any[] = topic.decisions || [];
  const stages: Stage[] = topic.stages || [];
  const placed = new Set(stages.flatMap(s => s.items));
  const loose = ds.filter(d => !placed.has(d.id));
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [creating, setCreating] = useState<{ stage: string; type: 'DECISION_TABLE' | 'FORMULA'; name: string } | null>(null);
  const save = useMutation({ mutationFn: (next: Stage[]) => api.post(`/platform/topics/${topic.id}/stages`, { stages: next }), onSuccess: () => qc.invalidateQueries({ queryKey: ['topic', topic.id] }) });
  const put = (next: Stage[]) => save.mutate(next);
  const move = (i: number, by: number) => { const n = [...stages]; const [x] = n.splice(i, 1); n.splice(i + by, 0, x); put(n); };
  const place = (stageId: string, id: string) => put(stages.map(s => ({ ...s, items: s.id === stageId ? [...s.items.filter(x => x !== id), id] : s.items.filter(x => x !== id) })));
  const create = useMutation({ meta: { silent: true },
    mutationFn: async () => {
      const c = creating!;
      const r = await rulesApi.create({ project_id: projectId, name: c.name, type: c.type, topic_id: topic.id, ...(c.type === 'FORMULA' && { definition: { lines: [] } }) });
      await api.post(`/platform/topics/${topic.id}/stages`, { stages: stages.map(s => (s.id === c.stage ? { ...s, items: [...s.items, r.id] } : s)) });
      return r;
    },
    onSuccess: (r: any) => { qc.invalidateQueries({ queryKey: ['topic', topic.id] }); setCreating(null); router.push(`/p/${projectId}/rules/${r.id}`); } });

  return (
    <div className="space-y-6">
      <ol className="m-0 p-0 list-none bg-white border border-[#e0e0e0]">
        {stages.map((st, i) => {
          const items = st.items.map(id => ds.find(d => d.id === id)).filter(Boolean) as any[];
          return (
            <li key={st.id} className="border-t border-[#e0e0e0] first:border-t-0">
              <div className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center min-h-[56px]">
                <span className="self-stretch flex items-center justify-center text-[14px] text-[#525252] border-r border-[#e0e0e0]">{i + 1}</span>
                <div className="px-4 py-2 flex items-baseline gap-4 min-w-0">
                  <span className="text-[16px] text-[#161616]">{st.name}</span>
                  <span className="text-[13px] text-[#525252]">{stageCounts(st, ds)}</span>
                </div>
                {canWrite && (
                  <div className="flex items-center gap-1 pr-3">
                    <button type="button" aria-label={`Move ${st.name} up`} disabled={i === 0} className="h-8 w-8 flex items-center justify-center hover:bg-[#e8e8e8] disabled:opacity-30" onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" aria-label={`Move ${st.name} down`} disabled={i === stages.length - 1} className="h-8 w-8 flex items-center justify-center hover:bg-[#e8e8e8] disabled:opacity-30" onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></button>
                    <button type="button" className="h-8 px-3 text-[14px] text-[#0f62fe] hover:bg-[#e8e8e8]" onClick={() => setRenaming({ id: st.id, name: st.name })}>Rename</button>
                    <button type="button" className="h-8 px-3 text-[14px] text-[#da1e28] hover:bg-[#fff1f1]" onClick={() => put(stages.filter(s => s.id !== st.id))}>Remove</button>
                  </div>
                )}
              </div>
              <div className="pl-[48px] border-t border-[#e0e0e0] bg-[#f4f4f4]">
                {items.map(d => (
                  <div key={d.id} className="flex flex-wrap items-center gap-x-6 px-4 h-11 border-b border-[#e0e0e0] last:border-b-0 bg-white">
                    <Link href={href(projectId, d)} className="flex-1 min-w-[200px] text-[14px] text-[#161616] hover:underline">{d.name}</Link>
                    <span className="text-[13px] text-[#525252] w-[130px]">{kindName(d.type)}</span>
                    {canWrite && <button type="button" className="text-[13px] text-[#525252] hover:text-[#da1e28]" onClick={() => put(stages.map(s => ({ ...s, items: s.items.filter(x => x !== d.id) })))}>Take out</button>}
                  </div>
                ))}
                {canWrite && (
                  <div className="flex flex-wrap items-center gap-2 px-4 py-2">
                    <button type="button" className="h-8 px-2 text-[14px] text-[#0f62fe] hover:underline" onClick={() => setCreating({ stage: st.id, type: 'DECISION_TABLE', name: '' })}>+ Decision</button>
                    <button type="button" className="h-8 px-2 text-[14px] text-[#0f62fe] hover:underline" onClick={() => setCreating({ stage: st.id, type: 'FORMULA', name: '' })}>+ Calculation</button>
                    {ds.length > 0 && <span className="w-[260px]"><Dropdown value="" placeholder="Put an existing one here" options={ds.filter(d => !st.items.includes(d.id)).map(d => ({ value: d.id, label: d.name, hint: kindName(d.type) }))} onChange={v => v && place(st.id, v)} /></span>}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {canWrite && (
        <form className="flex items-end gap-2 max-w-[480px]" onSubmit={e => { e.preventDefault(); if (newName.trim()) { put([...stages, { id: '', name: newName.trim(), items: [] }]); setNewName(''); } }}>
          <Input id="st-new" label="New step" className="flex-1" value={newName} onChange={setNewName} placeholder="Verification" />
          <Btn type="submit" disabled={!newName.trim() || save.isPending}>Add step</Btn>
        </form>
      )}
      {loose.length > 0 && (
        <div>
          <h2 className="text-[16px] mb-2">Not in a step</h2>
          <div className="bg-white border border-[#e0e0e0]">
            {loose.map(d => <Link key={d.id} href={href(projectId, d)} className="flex items-center gap-6 px-4 h-11 border-b border-[#e0e0e0] last:border-b-0 hover:bg-[#f4f4f4]"><span className="flex-1 text-[14px]">{d.name}</span><span className="text-[13px] text-[#525252]">{kindName(d.type)}</span></Link>)}
          </div>
        </div>
      )}
      {renaming && (
        <Modal title="Rename step" onClose={() => setRenaming(null)} onSubmit={() => { put(stages.map(s => (s.id === renaming.id ? { ...s, name: renaming.name.trim() } : s))); setRenaming(null); }} submitDisabled={!renaming.name.trim()}>
          <Input id="st-ren" label="Name" value={renaming.name} onChange={(v: string) => setRenaming({ ...renaming, name: v })} />
        </Modal>
      )}
      {creating && (
        <Modal title={creating.type === 'FORMULA' ? 'New calculation' : 'New decision'} onClose={() => setCreating(null)} onSubmit={() => create.mutate()} submitLabel="Create"
          submitDisabled={!creating.name.trim() || create.isPending} error={create.error ? String((create.error as any).message) : null}>
          <Input id="st-cr" label="Name" value={creating.name} onChange={(v: string) => setCreating({ ...creating, name: v })} />
        </Modal>
      )}
    </div>
  );
}
