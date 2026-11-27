'use client';
// The project's reason codes: code, text, outcome and priority (1 = most important). Decision lines add them
// with "then add reason"; the decision returns every code raised, the top one and its outcome.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Btn, Input, Modal, Table, Td } from '@/components/pipeline/ui';
import { Dropdown } from '@/components/pipeline/Dropdown';
import { usePerms } from '@/lib/perms';

export type Reason = { id: string; code: string; text: string; outcome: string; priority: number };
export const OUTCOMES = ['Decline', 'Refer', 'Approve'].map(o => ({ value: o, label: o }));
export const useReasons = (projectId?: string) => useQuery({ queryKey: ['reasons', projectId], queryFn: () => api.get<Reason[]>(`/platform/reasons?project_id=${projectId}`), enabled: !!projectId && !projectId.startsWith('_') });

export function ReasonCodes({ projectId }: { projectId: string }) {
  const qc = useQueryClient(); const perms = usePerms();
  const { data: rows = [] } = useReasons(projectId);
  const blank = { id: '', code: '', text: '', outcome: 'Decline', priority: '100' };
  const [f, setF] = useState<any>(null);
  const done = () => qc.invalidateQueries({ queryKey: ['reasons', projectId] });
  const save = useMutation({ meta: { silent: true }, mutationFn: () => api.post('/platform/reasons', { projectId, id: f.id || undefined, code: f.code, text: f.text, outcome: f.outcome, priority: Number(f.priority) }), onSuccess: () => { done(); setF(null); } });
  const remove = useMutation({ mutationFn: (id: string) => api.post(`/platform/reasons/${id}/remove`), onSuccess: done });
  return (
    <div className="space-y-4">
      {perms.write && <div><Btn onClick={() => setF(blank)}>Add reason</Btn></div>}
      <Table head={['Code', 'Text', 'Outcome', 'Priority', '']}>
        {rows.map(r => (
          <tr key={r.id} className="cursor-pointer hover:bg-[#f4f4f4]" onClick={() => perms.write && setF({ ...r, priority: String(r.priority) })}>
            <Td mono>{r.code}</Td><Td className="!whitespace-normal">{r.text}</Td><Td>{r.outcome}</Td><Td>{r.priority}</Td>
            <Td>{perms.write && <button className="h-8 px-3 text-[#da1e28] hover:bg-[#fff1f1]" onClick={e => { e.stopPropagation(); remove.mutate(r.id); }}>Remove</button>}</Td>
          </tr>
        ))}
      </Table>
      {f && (
        <Modal title={f.id ? 'Edit reason' : 'Add reason'} onClose={() => setF(null)} onSubmit={() => save.mutate()} submitLabel={f.id ? 'Save' : 'Add'}
          submitDisabled={!f.code.trim() || !f.text.trim() || save.isPending || !/^-?\d+$/.test(String(f.priority).trim())} error={save.error ? String((save.error as any).message) : null}>
          <div className="grid gap-4">
            <Input id="rc-code" label="Code" mono value={f.code} onChange={(v: string) => setF({ ...f, code: v })} placeholder="M004" />
            <Input id="rc-text" label="Text" value={f.text} onChange={(v: string) => setF({ ...f, text: v })} placeholder="Age below 20" />
            <div><div className="text-[12px] text-[#525252] mb-1.5">Outcome</div><Dropdown value={f.outcome} options={OUTCOMES} onChange={v => setF({ ...f, outcome: v })} /></div>
            <Input id="rc-prio" label="Priority (1 = most important)" value={f.priority} onChange={(v: string) => setF({ ...f, priority: v })} />
          </div>
        </Modal>
      )}
    </div>
  );
}
