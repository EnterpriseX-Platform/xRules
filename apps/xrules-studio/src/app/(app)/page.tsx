'use client';
// Home by role: what needs this person now. Business: topics and failing tests. Approver: changes to decide.
// Developer: data requests and API errors. Everyone: their own approval requests.
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Tag, fmtTime } from '@/components/pipeline/ui';
import { usePerms } from '@/lib/perms';
import { useAuth } from '@/lib/store';

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

  return (
    <div className="px-8 py-6 max-w-[1200px]">
      <PageHead title={`Hello${user?.name ? `, ${String(user.name).split(' ')[0]}` : ''}`} />
      <div className="grid gap-8 lg:grid-cols-2">
        {perms.approve && (
          <Section title="Waiting for your approval" count={h.toApprove.length} empty="Nothing to approve">
            {h.toApprove.map((r: any) => (
              <Row key={r.id} href={`/p/${r.projectId}/approvals`}>
                <span className="flex-1 min-w-[200px] text-[15px]">{r.title}</span><span className="text-[13px] text-[#525252]">{r.submittedBy}</span><span className="text-[12px] text-[#6f6f6f] w-[140px]">{fmtTime(r.createdAt)}</span>
              </Row>))}
          </Section>
        )}
        {perms.write && (
          <Section title="Your topics" count={h.topics.length} empty="No topics yet">
            {h.topics.map((t: any) => (
              <Row key={t.id} href={`/p/${t.projectId}/topics/${t.id}`}>
                <div className="flex-1 min-w-[200px]"><div className="text-[15px]">{t.name}</div>{t.goal && <div className="text-[12px] text-[#525252] truncate">{t.goal}</div>}</div>
                <span className="text-[13px] text-[#525252]">{t.project}</span>
              </Row>))}
          </Section>
        )}
        {perms.write && (
          <Section title="Failing tests" count={h.failingTests.length} empty="All tests pass">
            {h.failingTests.map((c: any) => (
              <Row key={c.id} href={c.targetType === 'rule' ? `/p/${c.projectId}/rules/${c.targetId}/tests` : `/p/${c.projectId}/flows/${c.targetId}`}>
                <span className="flex-1 min-w-[200px] text-[15px]">{c.name}</span><span className="text-[13px] text-[#525252]">{c.target}</span><span className="text-[13px] text-[#da1e28]">Fails</span>
              </Row>))}
          </Section>
        )}
        <Section title="Your approval requests" count={h.myRequests.length} empty="You have not asked for any approval">
          {h.myRequests.map((r: any) => (
            <Row key={r.id} href={`/p/${r.projectId}/approvals`}>
              <span className="flex-1 min-w-[200px] text-[15px]">{r.title}</span>{REVIEW[r.status] && <Tag tone={REVIEW[r.status][1]}>{REVIEW[r.status][0]}</Tag>}<span className="text-[12px] text-[#6f6f6f] w-[140px]">{fmtTime(r.createdAt)}</span>
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
