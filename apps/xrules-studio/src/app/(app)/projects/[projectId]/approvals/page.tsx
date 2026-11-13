'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Table, Td, Tag, Btn, Tabs, Notice, fmtTime } from '@/components/pipeline/ui';

const TYPE: Record<string, string> = { rule: 'Rule', decision_flow: 'Decision Flow', api_spec: 'API', release: 'Release' };
const ST: Record<string, [any, string]> = { PENDING: ['orange', 'Pending'], APPROVED: ['green', 'Approved'], REJECTED: ['red', 'Rejected'], WITHDRAWN: ['gray', 'Withdrawn'] };

export default function ApprovalsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();
  const [tab, setTab] = useState('Pending');
  const [note, setNote] = useState<Record<string, string>>({});
  const { data: rows = [] } = useQuery({ queryKey: ['reviews', projectId], queryFn: () => api.get<any[]>(`/platform/reviews?project_id=${projectId}`) });
  const decide = useMutation({ mutationFn: ({ id, ok }: any) => api.post(`/platform/reviews/${id}/${ok ? 'approve' : 'reject'}`, { note: note[id] }), onSuccess: () => qc.invalidateQueries({ queryKey: ['reviews', projectId] }) });
  const list = (rows as any[]).filter(r => tab === 'Pending' ? r.status === 'PENDING' : r.status !== 'PENDING');
  return (
    <div className="px-8 py-6">
      <PageHead title="Approvals" sub="Changes waiting for review before publishing · authors cannot approve their own work" />
      <Tabs tabs={['Pending', 'History']} value={tab} onChange={setTab} />
      {decide.error && <div className="mb-3"><Notice kind="error">{String((decide.error as any).message)}</Notice></div>}
      <Table head={['Type', 'Name', 'Submitted by', 'When', 'Status', tab === 'Pending' ? 'Comment' : 'Reviewer', '']} empty={!list.length ? <div className="px-4 py-6 text-[14px] text-[#525252]">Nothing here</div> : null}>
        {list.map((r: any) => (
          <tr key={r.id}>
            <Td>{TYPE[r.targetType] || r.targetType}</Td>
            <Td><div className="font-semibold">{r.title}</div>{r.note && <div className="text-[12px] text-[#525252]">{r.note}</div>}</Td>
            <Td>{r.submittedBy}</Td><Td>{fmtTime(r.createdAt)}</Td>
            <Td><Tag tone={ST[r.status][0]}>{ST[r.status][1]}</Tag></Td>
            <Td>{r.status === 'PENDING' ? <input className="input w-56" placeholder="Reason (optional)" value={note[r.id] || ''} onChange={e => setNote({ ...note, [r.id]: e.target.value })} /> : <span>{r.reviewedBy}{r.decisionNote && <span className="text-[12px] text-[#525252]"> · {r.decisionNote}</span>}</span>}</Td>
            <Td>{r.status === 'PENDING' && <div className="flex gap-1"><button className="h-8 px-3 text-white bg-[#0f62fe] hover:bg-[#0353e9]" onClick={() => decide.mutate({ id: r.id, ok: true })}>Approve</button><button className="h-8 px-3 text-[#da1e28] hover:bg-[#fff1f1]" onClick={() => decide.mutate({ id: r.id, ok: false })}>Reject</button></div>}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
