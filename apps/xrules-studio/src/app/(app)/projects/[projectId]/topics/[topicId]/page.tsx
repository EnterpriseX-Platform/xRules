'use client';
import { kindName } from '@/lib/kinds';
// One topic (เรื่อง): tabs that each answer one business question, over the same decisions.
import { useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, rulesApi, flowsApi } from '@/lib/api';
import { Btn, Input, Modal, Tag, fmtTime } from '@/components/pipeline/ui';
import { usePerms } from '@/lib/perms';
import { TopicSimulate } from '@/components/topic/TopicSimulate';
import { RequestData } from '@/components/topic/RequestData';
import { TopicDoc } from '@/components/topic/TopicDoc';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'qualify', label: 'Who qualifies' },
  { key: 'amount', label: 'How much' },
  { key: 'choose', label: 'Which one' },
  { key: 'tests', label: 'Tests' },
  { key: 'simulate', label: 'Simulate' },
  { key: 'approval', label: 'Approval' },
] as const;
type Key = typeof TABS[number]['key'];
const NEW: Record<string, { label: string; type?: string; flow?: boolean }> = {
  qualify: { label: 'New eligibility rule', type: 'DECISION_TABLE' },
  amount: { label: 'New calculation', type: 'FORMULA' },
  choose: { label: 'New strategy', flow: true },
};
function strategyGraph() {
  const steps: [string, string, any][] = [['in', 'input', { label: 'Request' }], ['items', 'items', { label: 'Requests', from: 'input.items' }], ['filter', 'screen', { label: 'Who qualifies' }],
    ['score', 'score', { label: 'Score', expression: '' }], ['rank', 'rank', { label: 'Rank', weights: [{ term: 'score', weight: 1 }] }], ['pick', 'pick', { label: 'Allocate', mode: 'budget', budget: 'budget', cost: '' }], ['out', 'output', { label: 'Result' }]];
  return { nodes: steps.map(([id, type, data], i) => ({ id, type, position: { x: 60 + (i % 4) * 300, y: 80 + Math.floor(i / 4) * 180 }, data: { kind: type, ...data } })),
    edges: steps.slice(1).map(([id], i) => ({ id: `e${i}`, source: steps[i][0], target: id })) };
}
const STATUS = (d: any) => d.reviewState === 'PENDING' ? <Tag tone="blue">In review</Tag> : d.status === 'published' ? <Tag tone="green">Live v{d.version}</Tag> : <Tag tone="orange">Draft</Tag>;

export default function TopicPage() {
  const { projectId, topicId } = useParams<{ projectId: string; topicId: string }>();
  const pathname = usePathname() || ''; const router = useRouter();
  const seg = pathname.split('/')[5] || 'overview';
  const tab: Key = (TABS.some(t => t.key === seg) ? seg : 'overview') as Key;
  const go = (k: Key) => router.replace(`/p/${projectId}/topics/${topicId}${k === 'overview' ? '' : `/${k}`}`, { scroll: false });
  const qc = useQueryClient(); const perms = usePerms();
  const { data: t } = useQuery({ queryKey: ['topic', topicId], queryFn: () => api.get<any>(`/platform/topics/${topicId}`) });
  const [creating, setCreating] = useState<string | null>(null);
  const [name, setName] = useState('');
  const create = useMutation({ meta: { silent: true },
    mutationFn: async (q: string) => {
      const n = NEW[q];
      if (n.flow) return { kind: 'flow', r: await flowsApi.create({ name, projectId, kind: 'DECISION', topicId,
        graph: strategyGraph() }) };
      return { kind: 'rule', r: await rulesApi.create({ project_id: projectId, name, type: n.type, topic_id: topicId, ...(n.type === 'FORMULA' && { definition: { lines: [] } }) }) };
    },
    onSuccess: ({ kind, r }: any) => { qc.invalidateQueries({ queryKey: ['topic', topicId] }); setCreating(null); router.push(kind === 'flow' ? `/p/${projectId}/flows/${r.id}` : `/p/${projectId}/rules/${r.id}`); } });
  if (!t) return null;
  const ds: any[] = t.decisions || [];
  const by = (q: string) => ds.filter(d => d.question === q);
  const href = (d: any) => d.kind === 'flow' ? `/p/${projectId}/flows/${d.id}` : `/p/${projectId}/rules/${d.id}`;
  const tests = ds.reduce((a, d) => ({ total: a.total + d.tests.total, pass: a.pass + d.tests.pass }), { total: 0, pass: 0 });

  const list = (items: any[], q?: string) => (
    <div>
      {q && perms.write && <div className="flex justify-end mb-3"><Btn onClick={() => { setName(''); setCreating(q); }}>{NEW[q].label}</Btn></div>}
      <div className="bg-white border border-[#e0e0e0]">
        {items.map(d => (
          <Link key={d.id} href={href(d)} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-4 border-b border-[#e0e0e0] last:border-b-0 hover:bg-[#f4f4f4]">
            <span className="flex-1 min-w-[220px] text-[15px] text-[#161616]">{d.name}</span>
            <span className="text-[13px] text-[#525252] w-[130px]">{kindName(d.type)}</span>
            <span className={`text-[13px] w-[120px] tabular-nums ${!d.tests.total || (!d.tests.fail && d.tests.pass < d.tests.total) ? 'text-[#6f6f6f]' : d.tests.pass === d.tests.total ? 'text-[#198038]' : 'text-[#da1e28]'}`}>{!d.tests.total ? 'No tests' : !d.tests.fail && d.tests.pass < d.tests.total ? `${d.tests.total - d.tests.pass} not run` : `${d.tests.pass}/${d.tests.total} pass`}</span>
            <span className="w-[110px]">{STATUS(d)}</span>
            <span className="text-[12px] text-[#6f6f6f] w-[150px]">{fmtTime(d.updatedAt)}</span>
          </Link>
        ))}
        {!items.length && <div className="px-5 py-8 text-[14px] text-[#525252]">{q ? `No ${TABS.find(x => x.key === q)?.label.toLowerCase()} decisions yet` : 'Nothing yet'}</div>}
      </div>
    </div>
  );

  return (
    <div className="px-8 py-6">
      <div className="text-[13px] mb-1"><Link href={`/p/${projectId}/topics`} className="text-[#0f62fe] hover:underline">Topics</Link></div>
      <div className="flex items-start gap-4"><h1 className="flex-1 text-[28px] leading-9 text-[#161616]">{t.name}</h1>{perms.write && <RequestData projectId={projectId} topicId={topicId} />}</div>
      {t.goal && <div className="text-[15px] text-[#525252] mt-1">{t.goal}</div>}
      <div className="flex border-b border-[#e0e0e0] mt-5 mb-6 overflow-x-auto" role="tablist">
        {TABS.map(x => (
          <button key={x.key} role="tab" aria-selected={tab === x.key} onClick={() => go(x.key)}
            className={`h-11 px-4 text-[14px] whitespace-nowrap border-b-2 -mb-px ${tab === x.key ? 'border-[#0f62fe] text-[#161616] font-semibold' : 'border-transparent text-[#525252] hover:text-[#161616]'}`}>
            {x.label}{x.key !== 'overview' && x.key !== 'simulate' && x.key !== 'approval' && x.key !== 'tests' && <span className="ml-1.5 text-[12px] text-[#6f6f6f] font-normal tabular-nums">{by(x.key).length}</span>}
          </button>
        ))}
      </div>

      {tab === 'overview' && <TopicDoc projectId={projectId} topic={t} onTab={go} />}
      {(tab === 'qualify' || tab === 'amount' || tab === 'choose') && list(by(tab), tab)}
      {tab === 'tests' && list(ds.filter(d => true))}
      {tab === 'simulate' && <TopicSimulate projectId={projectId} topicId={topicId} decisions={ds} last={t.lastSimulation} />}
      {tab === 'approval' && <TopicApprovals projectId={projectId} ids={ds.map(d => d.id)} />}

      {creating && (
        <Modal title={NEW[creating].label} onClose={() => setCreating(null)} onSubmit={() => create.mutate(creating)} submitLabel="Create" submitDisabled={!name.trim() || create.isPending} error={create.error ? String((create.error as any).message) : null}>
          <Input id="tp-new" label="Name" value={name} onChange={setName} />
        </Modal>
      )}
    </div>
  );
}

function TopicApprovals({ projectId, ids }: { projectId: string; ids: string[] }) {
  const { data: rows = [] } = useQuery({ queryKey: ['reviews', projectId], queryFn: () => api.get<any[]>(`/platform/reviews?project_id=${projectId}`) });
  const mine = (rows as any[]).filter(r => ids.includes(r.targetId));
  return (
    <div className="bg-white border border-[#e0e0e0]">
      {mine.map(r => (
        <Link key={r.id} href="/approvals" className="flex flex-wrap items-center gap-x-6 px-5 py-4 border-b border-[#e0e0e0] last:border-b-0 hover:bg-[#f4f4f4]">
          <span className="flex-1 min-w-[220px] text-[15px]">{r.title}</span>
          <span className="text-[13px] text-[#525252]">{r.submittedBy}</span>
          <span>{r.status === 'PENDING' ? <Tag tone="blue">In review</Tag> : r.status === 'APPROVED' ? <Tag tone="green">Approved</Tag> : r.status === 'REJECTED' ? <Tag tone="red">Sent back</Tag> : <Tag tone="gray">{r.status}</Tag>}</span>
          <span className="text-[12px] text-[#6f6f6f] w-[150px]">{fmtTime(r.createdAt)}</span>
        </Link>
      ))}
      {!mine.length && <div className="px-5 py-8 text-[14px] text-[#525252]">No approval requests for this topic</div>}
    </div>
  );
}
