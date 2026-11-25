'use client';
// Changes waiting to go live. A reviewer opens one, sees what changes as sentences (live vs draft)
// and the test result, then approves (which puts it live) or sends it back with a reason.
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Table, Td, Tag, Tabs, Notice, Modal, fmtTime } from '@/components/pipeline/ui';
import { usePerms } from '@/lib/perms';
import { useAuth } from '@/lib/store';
import { useTerms } from '@/lib/terms';
import { tableSentences } from '@/components/review/sentences';

const TYPE: Record<string, string> = { rule: 'Rule', decision_flow: 'Decision flow', api_spec: 'REST API', release: 'Release' };
const ST: Record<string, [any, string]> = { PENDING: ['blue', 'In review'], APPROVED: ['green', 'Approved'], REJECTED: ['red', 'Sent back'], WITHDRAWN: ['gray', 'Withdrawn'] };

export default function ApprovalsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [tab, setTab] = useState('In review');
  const [open, setOpen] = useState<any>(null);
  const { data: rows = [] } = useQuery({ queryKey: ['reviews', projectId], queryFn: () => api.get<any[]>(`/platform/reviews?project_id=${projectId}`) });
  const list = (rows as any[]).filter(r => tab === 'In review' ? r.status === 'PENDING' : r.status !== 'PENDING');
  return (
    <div className="px-8 py-6">
      <PageHead title="Approvals" sub={`${(rows as any[]).filter(r => r.status === 'PENDING').length} in review`} />
      <Tabs tabs={['In review', 'History']} value={tab} onChange={setTab} />
      <Table head={['Change', 'Type', 'Requested by', 'When', 'Status', 'Decided by']} empty={!list.length ? <div className="px-4 py-6 text-[14px] text-[#525252]">{tab === 'In review' ? 'No changes waiting' : 'No decisions yet'}</div> : null}>
        {list.map((r: any) => (
          <tr key={r.id} className="cursor-pointer hover:bg-[#e8e8e8]" onClick={() => setOpen(r)}>
            <Td><span className="font-semibold text-[#0f62fe]">{r.title}</span></Td>
            <Td>{TYPE[r.targetType] || r.targetType}</Td>
            <Td>{r.submittedBy}</Td><Td>{fmtTime(r.createdAt)}</Td>
            <Td><Tag tone={ST[r.status]?.[0] || 'gray'}>{ST[r.status]?.[1] || r.status}</Tag></Td>
            <Td>{r.reviewedBy ? <span>{r.reviewedBy}{r.decisionNote && <span className="text-[12px] text-[#525252]"> · {r.decisionNote}</span>}</span> : '—'}</Td>
          </tr>
        ))}
      </Table>
      {open && <Review r={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Review({ r, onClose }: { r: any; onClose: () => void }) {
  const qc = useQueryClient();
  const perms = usePerms();
  const me = useAuth(s => s.user);
  const [note, setNote] = useState('');
  const { label } = useTerms(r.projectId);
  const snap = r.snapshot || {};
  const isTable = r.targetType === 'rule' && String(snap.type || '').toUpperCase() === 'DECISION_TABLE';
  const after = isTable ? tableSentences(snap.definition, label) : [];
  const before = isTable && snap.live ? tableSentences(snap.live, label) : [];
  const { data: cases = [] } = useQuery({ queryKey: ['test-sheet', r.targetType, r.targetId], queryFn: () => api.get<any[]>(`/platform/tests/target/${r.targetType}/${r.targetId}`), enabled: r.targetType !== 'api_spec' });
  const passed = (cases as any[]).filter(c => c.lastStatus === 'PASS').length;
  const own = r.submittedBy === (me?.email || me?.id);
  const decide = useMutation({ meta: { silent: true }, mutationFn: (ok: boolean) => api.post<any>(`/platform/reviews/${r.id}/${ok ? 'approve' : 'reject'}`, { note }),
    onSuccess: (res: any) => { qc.invalidateQueries({ queryKey: ['reviews'] }); if (!res?.publishError) onClose(); } });
  const pending = r.status === 'PENDING';
  const canDecide = pending && perms.approve && !own;

  return (
    <Modal title={r.title} wide="xl" onClose={onClose} onSubmit={canDecide ? () => decide.mutate(true) : undefined} submitLabel="Approve and go live" submitDisabled={decide.isPending}
      error={decide.error ? String((decide.error as any).message) : (decide.data as any)?.publishError ? `Approved, but it could not go live: ${(decide.data as any).publishError}` : null}>
      <div className="text-[13px] text-[#525252]">{TYPE[r.targetType]} · requested by {r.submittedBy} · {fmtTime(r.createdAt)}{snap.liveVersion ? ` · live v${snap.liveVersion}` : ''}</div>

      {isTable ? (
        <div className="grid gap-px bg-[#e0e0e0] border border-[#e0e0e0] md:grid-cols-2">
          <div className="bg-white p-4"><div className="text-[12px] text-[#6f6f6f] mb-2">{before.length ? 'Live now' : 'Not live yet'}</div>
            {before.map((t, i) => <div key={i} className={`text-[14px] leading-7 ${after.includes(t) ? '' : 'bg-[#fff1f1] text-[#a2191f] line-through'}`}>{i + 1} · {t}</div>)}
          </div>
          <div className="bg-white p-4"><div className="text-[12px] text-[#6f6f6f] mb-2">After approval</div>
            {after.map((t, i) => <div key={i} className={`text-[14px] leading-7 ${before.includes(t) ? '' : 'bg-[#defbe6] text-[#044317]'}`}>{i + 1} · {t}</div>)}
          </div>
        </div>
      ) : (
        <div className="text-[14px] text-[#525252]">{r.targetType === 'api_spec' ? `${(snap.operations || []).length} operations` : `${(snap.graph?.nodes || []).length} steps`} in this change</div>
      )}

      {r.targetType !== 'api_spec' && (
        <div className={`border-l-4 px-4 py-2.5 text-[14px] ${!cases.length ? 'border-[#8d8d8d] bg-[#f4f4f4]' : passed === cases.length ? 'border-[#24a148] bg-[#defbe6]' : 'border-[#da1e28] bg-[#fff1f1]'}`}>
          {!cases.length ? 'No test cases' : `${passed} of ${cases.length} test cases pass`}
        </div>
      )}

      {pending && (own
        ? <Notice>You requested this change, so someone else approves it.</Notice>
        : !perms.approve ? <Notice>Only approvers can decide.</Notice>
        : <div>
            <label htmlFor="rv-note" className="block text-[12px] text-[#525252] mb-1.5">Reason (sent with your decision)</label>
            <input id="rv-note" className="input w-full" value={note} onChange={e => setNote(e.target.value)} />
            <button type="button" className="mt-3 h-10 px-4 text-[14px] border border-[#da1e28] text-[#da1e28] hover:bg-[#fff1f1]" disabled={decide.isPending} onClick={() => decide.mutate(false)}>Send back</button>
          </div>)}
      {!pending && <div className="text-[14px]">{ST[r.status]?.[1]} by {r.reviewedBy || '—'}{r.decisionNote ? ` · ${r.decisionNote}` : ''}</div>}
    </Modal>
  );
}
