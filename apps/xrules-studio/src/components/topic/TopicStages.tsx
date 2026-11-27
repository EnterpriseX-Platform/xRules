'use client';
// A "steps" topic: ordered, named stages (Policy → Income → … → Final), each holding decisions and calculations.
// Steps are edited on the map: a step opens beside the map like a box does.
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { api } from '@/lib/api';
import { kindName } from '@/lib/kinds';
import { Btn, Input, Modal } from '@/components/pipeline/ui';
import { Dropdown } from '@/components/pipeline/Dropdown';

export type Stage = { id: string; name: string; items: string[] };
const isCalc = (d: any) => d.question === 'amount';
export const stageCounts = (st: Stage, ds: any[]) => {
  const items = st.items.map(i => ds.find(d => d.id === i)).filter(Boolean);
  const c = items.filter(isCalc).length, n = items.length - c;
  return [n ? `${n} decision${n === 1 ? '' : 's'}` : '', c ? `${c} calculation${c === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ') || 'Empty';
};
const href = (projectId: string, d: any) => d.kind === 'flow' ? `/p/${projectId}/flows/${d.id}` : `/p/${projectId}/rules/${d.id}`;

/** Saving the ordered steps of a topic. */
export function useStages(topic: any) {
  const qc = useQueryClient();
  const stages: Stage[] = topic.stages || [];
  const save = useMutation({ mutationFn: (next: Stage[]) => api.post(`/platform/topics/${topic.id}/stages`, { stages: next }), onSuccess: () => qc.invalidateQueries({ queryKey: ['topic', topic.id] }) });
  const put = (next: Stage[]) => save.mutate(next);
  return {
    stages, save, put,
    move: (i: number, by: number) => { const n = [...stages]; const [x] = n.splice(i, 1); n.splice(i + by, 0, x); put(n); },
    place: (stageId: string, id: string) => put(stages.map(s => ({ ...s, items: s.id === stageId ? [...s.items.filter(x => x !== id), id] : s.items.filter(x => x !== id) }))),
    moveItem: (stageId: string, id: string, by: number) => put(stages.map(s => { if (s.id !== stageId) return s; const n = [...s.items]; const i = n.indexOf(id); const j = i + by; if (i < 0 || j < 0 || j >= n.length) return s; n.splice(i, 1); n.splice(j, 0, id); return { ...s, items: n }; })),
    takeOut: (id: string) => put(stages.map(s => ({ ...s, items: s.items.filter(x => x !== id) }))),
    rename: (stageId: string, name: string) => put(stages.map(s => (s.id === stageId ? { ...s, name } : s))),
    remove: (stageId: string) => put(stages.filter(s => s.id !== stageId)),
    add: (name: string) => put([...stages, { id: '', name, items: [] }]),
  };
}

/** Adding a step, at the foot of the map's middle column. */
export function AddStep({ topic }: { topic: any }) {
  const s = useStages(topic); const [name, setName] = useState('');
  return (
    <form className="flex items-end gap-2" onSubmit={e => { e.preventDefault(); if (name.trim()) { s.add(name.trim()); setName(''); } }}>
      <Input id="st-new" label="New step" className="flex-1" value={name} onChange={setName} placeholder="Verification" />
      <Btn type="submit" disabled={!name.trim() || s.save.isPending}>Add step</Btn>
    </form>
  );
}

/** One step opened beside the map: rename, move, what it holds, add or take out, remove. */
export function StagePanel({ projectId, topic, stageId, canWrite, onPick, onClose, onAdd }: {
  projectId: string; topic: any; stageId: string; canWrite: boolean; onPick: (id: string) => void; onClose: () => void;
  onAdd: (type: 'DECISION_TABLE' | 'FORMULA', stageId: string) => void;
}) {
  const s = useStages(topic); const ds: any[] = topic.decisions || [];
  const i = s.stages.findIndex(x => x.id === stageId); const st = s.stages[i];
  const [name, setName] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  if (!st) return null;
  const items = st.items.map(id => ds.find(d => d.id === id)).filter(Boolean) as any[];
  const act = 'h-10 px-4 inline-flex items-center gap-1 text-[14px] border border-[#8d8d8d] text-[#161616] hover:bg-[#e8e8e8] disabled:opacity-30';
  return (
    <section className="bg-white border border-[#e0e0e0] min-w-0">
      <div className="px-6 pt-5 pb-4 flex items-start gap-3 border-b border-[#e0e0e0]">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-[#525252]">Step {i + 1} of {s.stages.length}</div>
          {name == null
            ? <h2 className="m-0 text-[22px] leading-8 text-[#161616]">{st.name}</h2>
            : <form className="flex items-end gap-2 max-w-[480px] mt-1" onSubmit={e => { e.preventDefault(); if (name.trim()) { s.rename(st.id, name.trim()); setName(null); } }}>
                <Input id="st-ren" label="Name" className="flex-1" value={name} onChange={setName} />
                <Btn type="submit" disabled={!name.trim()}>Save</Btn><Btn kind="ghost" type="button" onClick={() => setName(null)}>Cancel</Btn>
              </form>}
          <div className="text-[13px] text-[#525252] mt-1">{stageCounts(st, ds)}</div>
        </div>
        <button aria-label="Back to map" onClick={onClose} className="h-8 px-2 flex items-center gap-1 text-[14px] text-[#0f62fe] hover:bg-[#e8e8e8]"><X className="h-4 w-4" />Back to map</button>
      </div>
      <div className="px-6 py-5">
        <h3 className="m-0 mb-2 text-[12px] font-semibold tracking-[.4px] text-[#525252]">IN THIS STEP</h3>
        <div className="border border-[#e0e0e0]">
          {items.map((d, k) => (
            <div key={d.id} className="flex flex-wrap items-center gap-x-6 px-4 h-11 border-b border-[#e0e0e0] last:border-b-0">
              <button className="flex-1 min-w-[200px] text-left text-[14px] text-[#0f62fe] hover:underline" onClick={() => onPick(d.id)}>{d.name}</button>
              <span className="text-[13px] text-[#525252] w-[130px]">{kindName(d.type)}</span>
              <Link href={href(projectId, d)} className="text-[13px]">Edit</Link>
              {canWrite && <span className="inline-flex"><button type="button" aria-label={`Move ${d.name} up`} disabled={k === 0} className="h-8 w-8 text-[14px] text-[#525252] hover:bg-[#e8e8e8] disabled:text-[#c6c6c6]" onClick={() => s.moveItem(st.id, d.id, -1)}>↑</button>
                <button type="button" aria-label={`Move ${d.name} down`} disabled={k === items.length - 1} className="h-8 w-8 text-[14px] text-[#525252] hover:bg-[#e8e8e8] disabled:text-[#c6c6c6]" onClick={() => s.moveItem(st.id, d.id, 1)}>↓</button></span>}
              {canWrite && <button type="button" className="text-[13px] text-[#525252] hover:text-[#da1e28]" onClick={() => s.takeOut(d.id)}>Take out</button>}
            </div>
          ))}
          {!items.length && <div className="px-4 py-3 text-[14px] text-[#6f6f6f]">Nothing in this step yet</div>}
        </div>
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <button type="button" className="h-8 px-2 text-[14px] text-[#0f62fe] hover:underline" onClick={() => onAdd('DECISION_TABLE', st.id)}>+ Decision</button>
            <button type="button" className="h-8 px-2 text-[14px] text-[#0f62fe] hover:underline" onClick={() => onAdd('FORMULA', st.id)}>+ Calculation</button>
            {ds.some(d => !st.items.includes(d.id)) && <span className="w-[280px]"><Dropdown value="" placeholder="Put an existing one here" options={ds.filter(d => !st.items.includes(d.id)).map(d => ({ value: d.id, label: d.name, hint: kindName(d.type) }))} onChange={v => v && s.place(st.id, v)} /></span>}
          </div>
        )}
      </div>
      {canWrite && (
        <div className="px-6 py-4 border-t border-[#e0e0e0] flex flex-wrap gap-2">
          <button className={act} onClick={() => setName(st.name)}>Rename</button>
          <button className={act} disabled={i === 0} onClick={() => s.move(i, -1)}><ArrowUp className="h-4 w-4" />Move up</button>
          <button className={act} disabled={i === s.stages.length - 1} onClick={() => s.move(i, 1)}><ArrowDown className="h-4 w-4" />Move down</button>
          <span className="flex-1" />
          <button className={`${act} text-[#da1e28] border-[#da1e28] hover:bg-[#fff1f1]`} onClick={() => setRemoving(true)}>Remove step</button>
        </div>
      )}
      {removing && (
        <Modal title={`Remove step "${st.name}"`} danger submitLabel="Remove" onClose={() => setRemoving(false)} onSubmit={() => { s.remove(st.id); setRemoving(false); onClose(); }}>
          <div className="text-[14px]">{items.length ? `${items.length} decision${items.length === 1 ? '' : 's'} in it stay in the topic under Not in a step.` : 'The step is empty.'}</div>
        </Modal>
      )}
    </section>
  );
}
