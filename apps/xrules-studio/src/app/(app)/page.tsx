'use client';
// Home by role: what needs this person now. Business: topics and failing tests. Approver: changes to decide.
// Developer: data requests and API errors. Everyone: their own approval requests.
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, fmtTime } from '@/components/pipeline/ui';
import { usePerms } from '@/lib/perms';
import { useAuth } from '@/lib/store';
import { NewerVersion } from '@/components/topic/Library';

function Section({ title, count, children, empty }: { title: string; count?: number; children: React.ReactNode; empty: string }) {
  const has = (count ?? 0) > 0;
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2"><h2 className="text-[16px] text-[#161616]">{title}</h2>{count ? <span className="text-[13px] text-[#6f6f6f] tabular-nums">{count}</span> : null}</div>
      <div className="bg-white border border-[#e0e0e0]">{has ? children : <div className="px-5 py-6 text-[14px] text-[#525252]">{empty}</div>}</div>
    </section>
  );
}
const Row = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-3.5 border-b border-[#e0e0e0] last:border-b-0 hover:bg-[#f4f4f4]">{children}</Link>
);
const REVIEW: Record<string, [string, any]> = { PENDING: ['In review', 'blue'], APPROVED: ['Approved', 'green'], REJECTED: ['Sent back', 'red'], WITHDRAWN: ['Withdrawn', 'gray'] };

export default function HomePage() {
  const perms = usePerms();
  const user = useAuth((s: any) => s.user);
  const qc = useQueryClient();
  const { data: h } = useQuery({ queryKey: ['home'], queryFn: () => api.get<any>('/platform/home') });
  const close = useMutation({ meta: { silent: true }, mutationFn: (id: string) => api.post(`/platform/data-requests/${id}/close`, { status: 'DONE' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['home'] }) });
  if (!h) return null;
  const me = user?.email;
  const dev = perms.integrate;
  const myData = (h.dataRequests as any[]).filter(d => d.requestedBy === me);
  const dataRows = dev ? h.dataRequests : myData;

  const STATE: Record<string, string> = { live: 'Live', draft: 'Draft', review: 'Waiting for approval', empty: 'Empty' };
  const needs: { key: string; title: string; sub?: string; href: string; act: string; bad?: boolean }[] = [
    ...(perms.write ? h.failingTests.map((c: any) => ({ key: `f${c.id}`, title: 'A test case fails', sub: `${c.target} · ${c.name}`, href: c.targetType === 'rule' ? `/p/${c.projectId}/rules/${c.targetId}/tests` : `/p/${c.projectId}/flows/${c.targetId}`, act: 'Open', bad: true })) : []),
    ...(perms.approve ? h.toApprove.map((r: any) => ({ key: `a${r.id}`, title: r.title, sub: `asked by ${r.submittedBy}`, href: `/p/${r.projectId}/approvals`, act: 'Review' })) : []),
    ...(h.dataReady || []).map((d: any) => ({ key: `d${d.id}`, title: `"${d.term}" is ready from IT`, sub: `You asked for it on ${fmtTime(d.createdAt)}`, href: `/p/${d.projectId}/vocabulary`, act: 'Use it' })),
    ...(h.myRequests as any[]).filter(r => r.status === 'APPROVED' || r.status === 'REJECTED').slice(0, 3).map(r => ({ key: `m${r.id}`, title: `${r.title} ${r.status === 'APPROVED' ? 'approved' : 'sent back'}`, sub: r.decisionNote || undefined, href: `/p/${r.projectId}/approvals`, act: 'Open', bad: r.status === 'REJECTED' })),
  ];
  const current = (h.topics as any[]).find(t => t.state === 'draft' || t.state === 'empty') || null;

  return (
    <div className="px-8 py-6 max-w-[1200px]">
      <PageHead title={`Hello${user?.name ? `, ${String(user.name).split(' ')[0]}` : ''}`} />
      {perms.write && current && <NextStep topicId={current.id} projectId={current.projectId} />}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] mt-8">
        {perms.write || perms.approve ? (
          <section>
            <h2 className="text-[16px] text-[#161616] mb-2">Your topics</h2>
            <div className="bg-white border border-[#e0e0e0]">
              <div className="grid grid-cols-[minmax(0,1fr)_90px_170px_90px] px-5 h-10 items-center text-[12px] font-semibold text-[#525252] bg-[#f4f4f4] border-b border-[#e0e0e0]"><span>Topic</span><span className="text-right">Lines</span><span className="pl-6">State</span><span className="text-right">Tests</span></div>
              {(h.topics as any[]).map(t => (
                <Link key={t.id} href={`/p/${t.projectId}/topics/${t.id}`} className="grid grid-cols-[minmax(0,1fr)_90px_170px_90px] items-center px-5 py-3 border-b border-[#e0e0e0] last:border-b-0 hover:bg-[#f4f4f4] hover:no-underline">
                  <span className="min-w-0"><span className="block text-[15px] text-[#161616]">{t.name}</span><span className="block text-[12px] text-[#525252] truncate">{t.goal || t.project}</span></span>
                  <span className="text-right text-[14px] text-[#161616] tabular-nums">{t.lines ? t.lines.toLocaleString() : ''}</span>
                  <span className={`pl-6 text-[14px] ${t.state === 'review' ? 'text-[#0043ce]' : t.state === 'live' ? 'text-[#198038]' : 'text-[#525252]'}`}>{STATE[t.state] || ''}</span>
                  <span className={`text-right text-[14px] tabular-nums ${t.tests?.fail ? 'text-[#da1e28]' : 'text-[#161616]'}`}>{t.tests?.total ? `${t.tests.pass} / ${t.tests.total}` : ''}</span>
                </Link>))}
              {!h.topics.length && <div className="px-5 py-6 text-[14px] text-[#525252]">No topics yet</div>}
            </div>
          </section>
        ) : <div />}
        <section>
          <h2 className="text-[16px] text-[#161616] mb-2">Needs you</h2>
          <div className="bg-white border border-[#e0e0e0]">
            {needs.map(n => (
              <div key={n.key} className="flex items-start gap-4 px-5 py-3 border-b border-[#e0e0e0] last:border-b-0">
                <div className="flex-1 min-w-0"><div className={`text-[14px] ${n.bad ? 'text-[#da1e28]' : 'text-[#161616]'}`}>{n.title}</div>{n.sub && <div className="text-[12px] text-[#525252] truncate">{n.sub}</div>}</div>
                <Link href={n.href} className="text-[14px] whitespace-nowrap">{n.act}</Link>
              </div>))}
            {perms.write && (h.libraryBehind || []).map((b: any) => (
              <div key={`l${b.ruleId}`} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-5 py-3 border-b border-[#e0e0e0] last:border-b-0">
                <div className="flex-1 min-w-[180px]"><div className="text-[14px] text-[#161616]">{b.name} v{b.latest} is approved</div><div className="text-[12px] text-[#525252] truncate">{b.product || b.topic} stays on v{b.pin}</div></div>
                <NewerVersion row={b} onDone={() => qc.invalidateQueries({ queryKey: ['home'] })} />
              </div>))}
            {!needs.length && !(perms.write && (h.libraryBehind || []).length) && <div className="px-5 py-6 text-[14px] text-[#525252]">Nothing needs you</div>}
          </div>
        </section>
      </div>
      <div className="grid gap-8 lg:grid-cols-2 mt-8">
        <Section title="Your approval requests" count={h.myRequests.length} empty="You have not asked for any approval">
          {h.myRequests.map((r: any) => (
            <Row key={r.id} href={`/p/${r.projectId}/approvals`}>
              <span className="flex-1 min-w-[200px] text-[15px]">{r.title}</span>{REVIEW[r.status] && <span className={`text-[13px] ${r.status === 'REJECTED' ? 'text-[#da1e28]' : r.status === 'APPROVED' ? 'text-[#198038]' : 'text-[#0043ce]'}`}>{REVIEW[r.status][0]}</span>}<span className="text-[12px] text-[#6f6f6f] w-[140px]">{fmtTime(r.createdAt)}</span>
            </Row>))}
        </Section>
        {(dev || myData.length > 0) && (
          <Section title={dev ? 'Data requests' : 'Your data requests'} count={dataRows.length} empty="No open data requests">
            {dataRows.map((d: any) => (
              <div key={d.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-3.5 border-b border-[#e0e0e0] last:border-b-0">
                <div className="flex-1 min-w-[200px]"><div className="text-[15px]">{d.term}</div>{d.note && <div className="text-[12px] text-[#525252]">{d.note}</div>}</div>
                <span className="text-[13px] text-[#525252]">{dev ? d.requestedBy : d.project}</span>
                <span className="text-[12px] text-[#6f6f6f] w-[140px]">{fmtTime(d.createdAt)}</span>
                {dev && <button className="h-8 px-3 text-[14px] text-[#0f62fe] hover:bg-[#e8e8e8]" onClick={() => close.mutate(d.id)}>Mark done</button>}
              </div>))}
          </Section>
        )}
        {dev && (
          <Section title="API errors, last 7 days" count={h.apiErrors.length} empty="No errors">
            {h.apiErrors.map((e: any) => (
              <Row key={e.id} href={e.kind === 'rule' ? `/p/${e.projectId}/rules/${e.targetId}` : `/p/${e.projectId}/flows/${e.targetId}`}>
                <div className="flex-1 min-w-[200px]"><div className="text-[15px]">{e.name}</div><div className="text-[12px] text-[#a2191f] truncate">{e.error}</div></div>
                <span className="text-[12px] text-[#6f6f6f] w-[140px]">{fmtTime(e.at)}</span>
              </Row>))}
          </Section>
        )}
      </div>
    </div>
  );
}

/** The topic being worked on: its steps with the next one to do. */
function NextStep({ topicId, projectId }: { topicId: string; projectId: string }) {
  const { data: t } = useQuery({ queryKey: ['topic', topicId], queryFn: () => api.get<any>(`/platform/topics/${topicId}`) });
  if (!t) return null;
  const ds: any[] = t.decisions || [];
  const has = (q: string) => ds.some(d => d.question === q);
  const live = ds.length > 0 && ds.every(d => d.status === 'published');
  const asked = live || ds.some(d => d.reviewState === 'PENDING');
  const base = `/p/${projectId}/topics/${topicId}`;
  const steps: { label: string; done: boolean; href: string }[] = [
    ...(t.shape === 'steps'
      ? (t.stages || []).map((s: any) => ({ label: `Set ${s.name.toLowerCase()}`, done: s.items.length > 0, href: `${base}/steps` }))
      : [{ label: 'Set who qualifies', done: has('qualify'), href: `${base}/qualify` }, { label: 'Set how much', done: has('amount'), href: `${base}/amount` }, { label: 'Choose which one', done: has('choose'), href: `${base}/choose` }]),
    { label: 'Try on real data', done: !!t.lastSimulation, href: `${base}/simulate` },
    { label: 'Request approval', done: asked, href: `${base}/approval` },
    { label: 'Go live', done: live, href: `${base}/approval` },
  ];
  const i = steps.findIndex(s => !s.done); if (i < 0) return null;
  return (
    <section className="bg-white border border-[#e0e0e0] grid lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="px-6 py-5">
        <div className="text-[13px] text-[#525252]">{t.name} · step {i + 1} of {steps.length}</div>
        <div className="text-[22px] leading-8 text-[#161616] mt-1">{steps[i].label}</div>
        <div className="flex gap-2 mt-4">
          <Link href={steps[i].href} className="h-10 pl-4 pr-8 inline-flex items-center text-[14px] bg-[#0f62fe] text-white hover:bg-[#0353e9] hover:no-underline">{steps[i].label}</Link>
          <Link href={base} className="h-10 pl-4 pr-8 inline-flex items-center text-[14px] text-[#0f62fe] hover:bg-[#e8e8e8] hover:no-underline">Open the topic</Link>
        </div>
      </div>
      <ol className="m-0 p-0 list-none border-t lg:border-t-0 lg:border-l border-[#e0e0e0] px-6 py-4 text-[14px] space-y-1.5">
        {steps.map((s, k) => (
          <li key={k} className="flex gap-3"><span className="w-5 tabular-nums text-[#6f6f6f]">{k + 1}</span>
            <Link href={s.href} className={k === i ? 'font-semibold text-[#161616]' : s.done ? 'text-[#525252] line-through decoration-[#a8a8a8]' : 'text-[#525252]'}>{s.label}</Link></li>))}
      </ol>
    </section>
  );
}
