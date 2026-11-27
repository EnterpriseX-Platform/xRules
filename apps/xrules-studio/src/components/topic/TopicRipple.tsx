'use client';
// Request approval as a chain: what you changed → what that changes → what it reaches; then Checked, Not changed, Who decides.
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useTerms } from '@/lib/terms';
import { kindName } from '@/lib/kinds';
import { tableSentences } from '@/components/review/sentences';
import { fmtTime } from '@/components/pipeline/ui';
import { Chip } from '@/components/links/Links';

const H = ({ children }: { children: React.ReactNode }) => <h3 className="m-0 mb-2 text-[12px] font-semibold tracking-[.4px] text-[#525252]">{children}</h3>;
const ST: Record<string, string> = { PENDING: 'In review', APPROVED: 'Approved', REJECTED: 'Sent back', WITHDRAWN: 'Withdrawn' };

export function TopicRipple({ projectId, topic }: { projectId: string; topic: any }) {
  const qc = useQueryClient(); const { label } = useTerms(projectId);
  const ds: any[] = topic.decisions || [];
  const changed = ds.filter(d => d.status !== 'published' && d.reviewState !== 'PENDING');
  const waiting = ds.filter(d => d.reviewState === 'PENDING');
  const { data: info } = useQuery({ queryKey: ['ripple', topic.id, ds.map(d => d.id + d.updatedAt).join()],
    queryFn: async () => {
      const m: Record<string, any> = {};
      await Promise.all(ds.map(async d => {
        const links = await api.get<any>(`/platform/links/${d.kind === 'flow' ? 'flow' : 'rule'}/${d.id}`).catch(() => null);
        let diff: { added: number; removed: number } | null = null;
        if (d.kind === 'rule' && d.type === 'DECISION_TABLE' && changed.includes(d)) {
          const vs = await api.get<any[]>(`/rules/${d.id}/versions`).catch(() => []);
          const before = vs?.[0]?.definition ? tableSentences(vs[0].definition, label) : []; const after = tableSentences(d.definition, label);
          diff = { added: after.filter(t => !before.includes(t)).length, removed: before.filter(t => !after.includes(t)).length };
        }
        m[d.id] = { links, diff };
      }));
      return m;
    } });
  const { data: reviews = [] } = useQuery({ queryKey: ['reviews', projectId], queryFn: () => api.get<any[]>(`/platform/reviews?project_id=${projectId}`) });
  const mine = (reviews as any[]).filter(r => ds.some(d => d.id === r.targetId));

  const ids = new Set(changed.map(d => d.id));
  // words the changed boxes work out (results, calculation lines): a box reading one of them changes too
  const madeWords = new Set<string>(changed.flatMap(d => [...(d.definition?.outputs || []).map((x: any) => x?.name), ...(d.type === 'FORMULA' ? (d.definition?.lines || []).map((x: any) => x?.name) : [])]).filter(Boolean));
  const affected = ds.filter(d => !ids.has(d.id) && (info?.[d.id]?.links?.uses || []).some((u: any) => ids.has(u.id) || (u.kind === 'word' && madeWords.has(u.id))));
  const reach = new Map<string, any>();
  [...changed, ...affected].forEach(d => (info?.[d.id]?.links?.usedBy || []).forEach((u: any) => { if (!ds.some(x => x.id === u.id)) reach.set(u.id, u); }));
  const untouched = ds.filter(d => !ids.has(d.id) && !affected.includes(d));
  const tests = changed.reduce((a, d) => ({ total: a.total + (d.tests?.total || 0), pass: a.pass + (d.tests?.pass || 0) }), { total: 0, pass: 0 });
  const sim = topic.lastSimulation;
  const item = (d: any) => ({ kind: d.kind === 'flow' ? 'strategy' : d.question === 'amount' ? 'amount' : 'qualify', id: d.id, name: d.name, href: d.kind === 'flow' ? `/p/${projectId}/flows/${d.id}` : `/p/${projectId}/rules/${d.id}` });
  const what = (d: any) => { const x = info?.[d.id]?.diff; return x ? [x.added && `${x.added} new or changed line${x.added === 1 ? '' : 's'}`, x.removed && `${x.removed} removed`].filter(Boolean).join(' · ') || 'same lines, other settings changed' : d.version > 1 || d.status === 'published' ? 'changed' : 'new, not live before'; };

  const [sent, setSent] = useState(false);
  const send = useMutation({ meta: { silent: true }, mutationFn: () => Promise.all(changed.map(d => api.post('/platform/reviews', { targetType: d.kind === 'flow' ? 'decision_flow' : 'rule', targetId: d.id }))),
    onSuccess: () => { setSent(true); qc.invalidateQueries({ queryKey: ['topic', topic.id] }); qc.invalidateQueries({ queryKey: ['reviews'] }); } });

  return (
    <div className="space-y-8">
      {changed.length > 0 ? (
        <section className="bg-white border border-[#e0e0e0]">
          <div className="grid md:grid-cols-3">
            <div className="px-5 py-4 border-b md:border-b-0 md:border-r border-[#e0e0e0]"><H>YOU CHANGED</H>
              <ul className="m-0 p-0 list-none space-y-2 text-[14px]">{changed.map(d => <li key={d.id}><Chip item={item(d)} /><div className="text-[13px] text-[#525252]">{what(d)}</div></li>)}</ul></div>
            <div className="px-5 py-4 border-b md:border-b-0 md:border-r border-[#e0e0e0]"><H>WHICH CHANGES</H>
              {affected.length ? <ul className="m-0 p-0 list-none space-y-2 text-[14px]">{affected.map(d => <li key={d.id}><Chip item={item(d)} /><div className="text-[13px] text-[#525252]">{kindName(d.type)} · uses what you changed{d.reviewState === 'PENDING' ? ' · already waiting for approval' : ''}</div></li>)}</ul> : <div className="text-[14px] text-[#6f6f6f]">Nothing else in this topic uses it</div>}
              {sim?.draft && <div className="mt-3 text-[13px] text-[#525252]">Last try{sim.dataset ? ` on ${sim.dataset}` : ''}: {sim.draft.picked != null ? `${sim.draft.picked} picked` : ''}{sim.draft.dropped != null ? ` · ${sim.draft.dropped} not` : ''}</div>}</div>
            <div className="px-5 py-4"><H>WHICH REACHES</H>
              {reach.size ? <ul className="m-0 p-0 list-none space-y-2 text-[14px]">{Array.from(reach.values()).map(u => <li key={u.id}><Chip item={u} /><div className="text-[13px] text-[#525252]">{u.kind === 'api' ? `API${u.note ? ` · ${u.note}` : ''}` : 'flow'}</div></li>)}</ul> : <div className="text-[14px] text-[#6f6f6f]">No system calls it yet</div>}</div>
          </div>
          <div className="grid md:grid-cols-3 border-t border-[#e0e0e0]">
            <div className="px-5 py-4 md:border-r border-[#e0e0e0]"><H>CHECKED</H>
              <div className={`text-[14px] ${!tests.total ? 'text-[#6f6f6f]' : tests.pass === tests.total ? 'text-[#198038]' : 'text-[#da1e28]'}`}>{tests.total ? `${tests.pass} of ${tests.total} test cases pass` : 'No test cases yet'}</div>
              {sim && <div className="text-[13px] text-[#525252] mt-1">Tried{sim.dataset ? ` on ${sim.dataset}` : ''}{sim.at ? ` · ${fmtTime(sim.at)}` : ''}</div>}</div>
            <div className="px-5 py-4 md:border-r border-[#e0e0e0]"><H>NOT CHANGED</H>
              {untouched.length ? <div className="text-[14px] flex flex-wrap gap-x-3 gap-y-1">{untouched.map(d => <Chip key={d.id} item={item(d)} />)}</div> : <div className="text-[14px] text-[#6f6f6f]">Everything else in this topic is part of the change</div>}</div>
            <div className="px-5 py-4"><H>WHO DECIDES</H><div className="text-[14px]">An approver of this project</div></div>
          </div>
          <div className="px-5 py-4 border-t border-[#e0e0e0] flex items-center gap-4">
            <button type="button" className="h-10 pl-4 pr-8 text-[14px] bg-[#0f62fe] text-white hover:bg-[#0353e9] disabled:opacity-40" disabled={send.isPending || sent} onClick={() => send.mutate()}>Send for approval</button>
            {send.error && <span className="text-[14px] text-[#da1e28]">{String((send.error as any).message)}</span>}
          </div>
        </section>
      ) : <div className="bg-white border border-[#e0e0e0] px-5 py-6 text-[14px] text-[#525252]">{waiting.length ? `${waiting.length} change${waiting.length === 1 ? '' : 's'} waiting for approval` : 'No changes to send; everything in this topic is live'}</div>}

      <section>
        <h2 className="text-[16px] mb-2">Requests</h2>
        <div className="bg-white border border-[#e0e0e0]">
          {mine.map(r => (
            <Link key={r.id} href={`/p/${projectId}/approvals`} className="flex flex-wrap items-center gap-x-6 px-5 py-3 border-b border-[#e0e0e0] last:border-b-0 hover:bg-[#f4f4f4] hover:no-underline">
              <span className="flex-1 min-w-[220px] text-[15px] text-[#161616]">{r.title}</span>
              <span className="text-[13px] text-[#525252]">{r.submittedBy}</span>
              <span className={`text-[13px] w-[100px] ${r.status === 'REJECTED' ? 'text-[#da1e28]' : r.status === 'APPROVED' ? 'text-[#198038]' : 'text-[#0043ce]'}`}>{ST[r.status] || r.status}</span>
              <span className="text-[12px] text-[#6f6f6f] w-[150px]">{fmtTime(r.createdAt)}</span>
            </Link>))}
          {!mine.length && <div className="px-5 py-6 text-[14px] text-[#525252]">No approval requests for this topic</div>}
        </div>
      </section>
    </div>
  );
}
