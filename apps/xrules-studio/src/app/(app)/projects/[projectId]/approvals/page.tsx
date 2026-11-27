'use client';
// Changes waiting to go live. A reviewer opens one, sees what changes as sentences (live vs draft)
// and the test result, then approves (which puts it live) or sends it back with a reason.
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Table, Td, Tag, Tabs, Notice, fmtTime } from '@/components/pipeline/ui';
import { usePerms } from '@/lib/perms';
import { useAuth } from '@/lib/store';
import { useTerms } from '@/lib/terms';
import { tableSentences } from '@/components/review/sentences';
import { SimResult } from '@/components/topic/TopicSimulate';

const TYPE: Record<string, string> = { rule: 'Rule', decision_flow: 'Decision flow', api_spec: 'REST API', release: 'Release' };
const ST: Record<string, [any, string]> = { PENDING: ['blue', 'In review'], APPROVED: ['green', 'Approved'], REJECTED: ['red', 'Sent back'], WITHDRAWN: ['gray', 'Withdrawn'] };

export default function ApprovalsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [tab, setTab] = useState('In review');
  const [open, setOpen] = useState<any>(null);
  const { data: rows = [] } = useQuery({ queryKey: ['reviews', projectId], queryFn: () => api.get<any[]>(`/platform/reviews?project_id=${projectId}`) });
  const list = (rows as any[]).filter(r => tab === 'In review' ? r.status === 'PENDING' : r.status !== 'PENDING');
  if (open) return <div className="px-8 py-6"><Review r={open} onClose={() => setOpen(null)} /></div>;
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
  // the result shown must be for the change under review, not an older run
  const [fresh, setFresh] = useState(r.targetType === 'api_spec' || r.status !== 'PENDING');
  useEffect(() => {
    if (fresh) return;
    api.post(`/platform/tests/target/${r.targetType}/${r.targetId}/run`, {}).catch(() => {}).finally(() => { qc.invalidateQueries({ queryKey: ['test-sheet', r.targetType, r.targetId] }); setFresh(true); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const passed = (cases as any[]).filter(c => c.lastStatus === 'PASS').length;
  const own = r.submittedBy === (me?.email || me?.id);
  const decide = useMutation({ meta: { silent: true }, mutationFn: (ok: boolean) => api.post<any>(`/platform/reviews/${r.id}/${ok ? 'approve' : 'reject'}`, { note }),
    onSuccess: (res: any) => { qc.invalidateQueries({ queryKey: ['reviews'] }); if (!res?.publishError) onClose(); } });
  const pending = r.status === 'PENDING';
  const canDecide = pending && perms.approve && !own;

  const removed = before.filter(t => !after.includes(t)); const added = after.filter(t => !before.includes(t));
  const same = after.length - added.length;
  const sim = r.evidence?.simulation;
  const btn = 'h-10 pl-4 pr-8 text-[14px] disabled:opacity-40';
  const err = decide.error ? String((decide.error as any).message) : (decide.data as any)?.publishError ? `Approved, but it could not go live: ${(decide.data as any).publishError}` : null;
  return (
    <div className="max-w-[1100px]">
      <div className="text-[13px] mb-1"><button className="text-[#0f62fe] hover:underline" onClick={onClose}>Approvals</button></div>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-[260px]">
          <h1 className="text-[28px] leading-9 text-[#161616]">{r.title}</h1>
          <div className="text-[14px] text-[#525252] mt-1">Requested by {r.submittedBy} · {fmtTime(r.createdAt)}{pending ? ' · goes live on approval' : ''}{snap.liveVersion ? ` · live now v${snap.liveVersion}` : ''}</div>
        </div>
        {canDecide && <div className="flex gap-2">
          <button type="button" className={`${btn} border border-[#da1e28] text-[#da1e28] hover:bg-[#fff1f1]`} disabled={decide.isPending} onClick={() => decide.mutate(false)}>Send back</button>
          <button type="button" className={`${btn} bg-[#0f62fe] text-white hover:bg-[#0353e9]`} disabled={decide.isPending} onClick={() => decide.mutate(true)}>Approve and go live</button>
        </div>}
      </div>
      {err && <div className="mt-4"><Notice kind="error">{err}</Notice></div>}

      <div className="grid gap-8 mt-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          {isTable ? (
            <div className="grid gap-px bg-[#e0e0e0] border border-[#e0e0e0] md:grid-cols-2">
              <div className="bg-white p-4"><div className="text-[12px] font-semibold tracking-[.4px] text-[#525252] mb-2">{before.length ? 'LIVE NOW' : 'NOT LIVE YET'}</div>
                {removed.map((t, i) => <div key={i} className="text-[14px] leading-7 bg-[#fff1f1] text-[#a2191f] line-through px-1">{before.indexOf(t) + 1} · {t}</div>)}
                {!removed.length && <div className="text-[14px] text-[#6f6f6f]">Nothing removed or changed</div>}
              </div>
              <div className="bg-white p-4"><div className="text-[12px] font-semibold tracking-[.4px] text-[#525252] mb-2">AFTER APPROVAL</div>
                {added.map((t, i) => <div key={i} className="text-[14px] leading-7 bg-[#defbe6] text-[#044317] px-1">{after.indexOf(t) + 1} · {t}</div>)}
                {!added.length && <div className="text-[14px] text-[#6f6f6f]">No new lines</div>}
              </div>
              {same > 0 && <div className="bg-[#f4f4f4] px-4 py-2 text-[13px] text-[#525252] md:col-span-2">{same.toLocaleString()} line{same === 1 ? '' : 's'} unchanged, not shown</div>}
            </div>
          ) : (
            <div className="text-[14px] text-[#525252]">{r.targetType === 'api_spec' ? `${(snap.operations || []).length} operations` : `${(snap.graph?.nodes || []).length} steps`} in this change</div>
          )}
          {sim && <div><div className="text-[12px] font-semibold tracking-[.4px] text-[#525252] mb-2">TRIED ON REAL DATA · {fmtTime(sim.at)}{sim.dataset ? ` · ${sim.dataset}` : ''}</div><SimResult r={sim} label={label} /></div>}
        </div>
        <aside className="space-y-5 text-[14px] lg:border-l lg:border-[#e0e0e0] lg:pl-6">
          {r.targetType !== 'api_spec' && <div><div className="text-[12px] font-semibold tracking-[.4px] text-[#525252] mb-2">CHECKED</div>
            <div className={!fresh || !cases.length ? 'text-[#525252]' : passed === cases.length ? 'text-[#198038]' : 'text-[#da1e28]'}>{!fresh ? 'Running test cases on this change' : !cases.length ? 'No test cases' : `${passed} of ${cases.length} test cases pass`}</div>
            {fresh && passed < cases.length && <div className="mt-1 text-[13px] text-[#da1e28]">{(cases as any[]).filter(c => c.lastStatus !== 'PASS').map(c => c.name).join(', ')}</div>}</div>}
          {pending && (own ? <div className="text-[#525252]">You requested this change, so someone else approves it.</div>
            : !perms.approve ? <div className="text-[#525252]">Only approvers can decide.</div>
            : <div><label htmlFor="rv-note" className="block text-[12px] font-semibold tracking-[.4px] text-[#525252] mb-2">REASON, SENT WITH YOUR DECISION</label>
                <textarea id="rv-note" rows={4} className="w-full px-3 py-2 bg-[#f4f4f4] border-b border-[#8d8d8d] text-[14px] outline-none focus:outline focus:outline-2 focus:outline-[#0f62fe]" value={note} onChange={e => setNote(e.target.value)} /></div>)}
          {!pending && <div>{ST[r.status]?.[1]} by {r.reviewedBy || '—'}{r.decisionNote ? ` · ${r.decisionNote}` : ''}</div>}
        </aside>
      </div>
    </div>
  );
}
