'use client';
// One topic: the map is the topic. Boxes and steps open beside it; Try on real data and Request approval come from the header.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, rulesApi, flowsApi } from '@/lib/api';
import { Btn, Input, Modal } from '@/components/pipeline/ui';
import { usePerms } from '@/lib/perms';
import { TopicSimulate } from '@/components/topic/TopicSimulate';
import { RequestData } from '@/components/topic/RequestData';
import { TopicMap, type AddKind } from '@/components/topic/TopicMap';
import { TopicRipple } from '@/components/topic/TopicRipple';
import { TopicTests } from '@/components/topic/TopicTests';
import { ValueCombo } from '@/components/rule/ValueCombo';
import { useTerms } from '@/lib/terms';
import { NewProductFrom } from '@/components/topic/Library';

// Old tab URLs (/qualify, /tests, /steps, …) land on the map; /simulate and /approval open that view.
const OLD_VIEW: Record<string, string> = { simulate: 'simulate', approval: 'approval' };
function strategyGraph() {
  const steps: [string, string, any][] = [['in', 'input', { label: 'Request' }], ['items', 'items', { label: 'Requests', from: 'input.items' }], ['filter', 'screen', { label: 'Who qualifies' }],
    ['score', 'score', { label: 'Score', expression: '' }], ['rank', 'rank', { label: 'Rank', weights: [{ term: 'score', weight: 1 }] }], ['pick', 'pick', { label: 'Allocate', mode: 'budget', budget: 'budget', cost: '' }], ['out', 'output', { label: 'Result' }]];
  return { nodes: steps.map(([id, type, data], i) => ({ id, type, position: { x: 60 + (i % 4) * 300, y: 80 + Math.floor(i / 4) * 180 }, data: { kind: type, ...data } })),
    edges: steps.slice(1).map(([id], i) => ({ id: `e${i}`, source: steps[i][0], target: id })) };
}
export default function TopicPage() {
  const { projectId, topicId } = useParams<{ projectId: string; topicId: string }>();
  const pathname = usePathname() || ''; const router = useRouter(); const sp = useSearchParams();
  const base = `/p/${projectId}/topics/${topicId}`;
  const seg = pathname.split('/')[5];
  useEffect(() => { if (seg) router.replace(OLD_VIEW[seg] ? `${base}?view=${OLD_VIEW[seg]}` : base, { scroll: false }); }, [seg, base, router]);
  const view = (OLD_VIEW[seg || ''] || sp?.get('view') || 'map') as 'map' | 'simulate' | 'approval';
  const show = (v: 'map' | 'simulate' | 'approval') => router.replace(v === 'map' ? base : `${base}?view=${v}`, { scroll: false });
  const qc = useQueryClient(); const perms = usePerms();
  const { data: t } = useQuery({ queryKey: ['topic', topicId], queryFn: () => api.get<any>(`/platform/topics/${topicId}`) });
  const [creating, setCreating] = useState<AddKind | null>(null);
  const { data: topicCases = [] } = useQuery({ queryKey: ['topic-tests', topicId], queryFn: () => api.get<any[]>(`/platform/tests/target/topic/${topicId}`) });
  const { data: allTopics = [] } = useQuery({ queryKey: ['topics', projectId], queryFn: () => api.get<any[]>(`/platform/topics?project_id=${projectId}`) });
  const setProduct = useMutation({ mutationFn: (product: string) => api.post(`/platform/topics/${topicId}/update`, { product }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['topic', topicId] }); qc.invalidateQueries({ queryKey: ['topics', projectId] }); } });
  const setSettings = useMutation({ meta: { failLabel: "Couldn't save" }, mutationFn: (settings: any) => api.post(`/platform/topics/${topicId}/update`, { settings }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['topic', topicId] }); } });
  const [name, setName] = useState('');
  const [cloning, setCloning] = useState(false);
  // the name box takes the typing straight away
  useEffect(() => { if (creating) { const h = setTimeout(() => document.getElementById('tp-new')?.focus(), 60); return () => clearTimeout(h); } }, [creating]);
  const create = useMutation({ meta: { silent: true },
    mutationFn: async (k: AddKind) => {
      if (k.type === 'STRATEGY') return { kind: 'flow', r: await flowsApi.create({ name, projectId, kind: 'DECISION', topicId, graph: strategyGraph() }) };
      const r = await rulesApi.create({ project_id: projectId, name, type: k.type, topic_id: topicId, ...(k.type === 'FORMULA' && { definition: { lines: [] } }) });
      if (k.stageId) await api.post(`/platform/topics/${topicId}/stages`, { stages: (t.stages || []).map((s: any) => (s.id === k.stageId ? { ...s, items: [...s.items, r.id] } : s)) });
      return { kind: 'rule', r };
    },
    onSuccess: ({ kind, r }: any) => { qc.invalidateQueries({ queryKey: ['topic', topicId] }); setCreating(null); router.push(kind === 'flow' ? `/p/${projectId}/flows/${r.id}` : `/p/${projectId}/rules/${r.id}`); } });
  if (!t) return null;
  const ds: any[] = t.decisions || [];
  const tests0 = ds.reduce((a, d) => ({ total: a.total + (d.tests?.total || 0), pass: a.pass + (d.tests?.pass || 0), fail: a.fail + (d.tests?.fail || 0) }), { total: 0, pass: 0, fail: 0 });
  const tc = (topicCases as any[]);
  const tests = { total: tests0.total + tc.length, pass: tests0.pass + tc.filter(c => c.lastStatus === 'PASS').length, fail: tests0.fail + tc.filter(c => c.lastStatus === 'FAIL' || c.lastStatus === 'ERROR').length };
  const NEW_LABEL = { DECISION_TABLE: 'New decision', FORMULA: 'New calculation', STRATEGY: 'New strategy' };
  const back = <button className="text-[14px] text-[#0f62fe] hover:underline mb-4" onClick={() => show('map')}>Back to map</button>;

  return (
    <div className="px-8 py-6">
      <div className="text-[13px] mb-1"><Link href={`/p/${projectId}/topics`} className="text-[#0f62fe] hover:underline">Topics</Link></div>
      <div className="flex items-start gap-4"><h1 className="flex-1 text-[28px] leading-9 text-[#161616]">{t.name}</h1><div className="flex gap-2 shrink-0 whitespace-nowrap">{perms.write && <RequestData projectId={projectId} topicId={topicId} />}{perms.write && t?.product && <Btn kind="tertiary" onClick={() => setCloning(true)}>New product from {t.product}</Btn>}<Btn kind="secondary" onClick={() => show('simulate')}>Try on real data</Btn>{perms.write && <Btn onClick={() => show('approval')}>Request approval</Btn>}</div></div>
      {t.goal && <div className="text-[15px] text-[#525252] mt-1">{t.goal}</div>}
      <div className="flex flex-wrap items-center gap-2 mt-2 text-[14px]"><span className="text-[#525252]">Product</span>
        {perms.write ? <ValueCombo className="h-8 min-w-[160px] bg-transparent border-b border-[#8d8d8d] px-1 text-[14px] text-[#161616] outline-none focus:border-[#0f62fe]" value={t.product || ''} placeholder="None" ariaLabel="Product"
          values={Array.from(new Set(((allTopics as any[]) || []).map((x: any) => x.product).filter(Boolean)))} onChange={v => setProduct.mutate(v)} /> : <span>{t.product || 'None'}</span>}
        <TopicSettings settings={t.settings || {}} canWrite={!!perms.write} error={setSettings.error ? String((setSettings.error as any).message) : null} onSave={v => setSettings.mutate(v)} />
      </div>
      <TopicOutputs projectId={projectId} settings={t.settings || {}} canWrite={!!perms.write} onSave={v => setSettings.mutate(v)} />
      <div className="text-[13px] text-[#525252] mt-2 mb-6 border-b border-[#e0e0e0] pb-3">{ds.length} decision{ds.length === 1 ? '' : 's'}{t.shape === 'steps' ? ` in ${(t.stages || []).length} step${(t.stages || []).length === 1 ? '' : 's'}` : ''} · <span className={tests.fail ? 'text-[#da1e28]' : ''}>{tests.total ? `tests ${tests.pass}/${tests.total} pass${tests.fail ? ` · ${tests.fail} fail` : ''}` : 'no tests yet'}</span></div>

      {view === 'map' && <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1fr)_360px] items-start">
        <TopicMap projectId={projectId} topic={t} canWrite={!!perms.write} onAdd={k => { setName(''); setCreating(k); }} onSimulate={() => show('simulate')} />
        <TopicTests projectId={projectId} topicId={topicId} canWrite={!!perms.write} runKey={t.updatedAt}
          outputs={ds.flatMap((d: any) => [...(d.definition?.outputs || []), ...(d.type === 'FORMULA' ? d.definition?.lines || [] : [])]).map((o: any) => o?.name).filter(Boolean).map((n: string) => ({ path: n, name: n }))} />
      </div>}
      {view === 'simulate' && <>{back}<TopicSimulate projectId={projectId} topicId={topicId} decisions={ds} last={t.lastSimulation} /></>}
      {view === 'approval' && <>{back}<TopicRipple projectId={projectId} topic={t} /></>}

      {cloning && <NewProductFrom topic={t} onClose={() => setCloning(false)} onMade={id => { setCloning(false); qc.invalidateQueries({ queryKey: ['topics', projectId] }); router.push(`/p/${projectId}/topics/${id}`); }} />}
      {creating && (
        <Modal title={NEW_LABEL[creating.type]} onClose={() => setCreating(null)} onSubmit={() => create.mutate(creating)} submitLabel={create.isPending ? 'Creating…' : 'Create'} submitDisabled={!name.trim() || create.isPending} error={create.error ? String((create.error as any).message) : null}>
          <Input id="tp-new" label="Name" value={name} onChange={setName} />
        </Modal>
      )}
    </div>
  );
}

const OUTS = ['Approve', 'Refer', 'Decline', 'Reject', 'Cancel', 'Pending'];
/** The topic's decision date (blank = today) and what it answers when no reason code fires. */
function TopicSettings({ settings, canWrite, onSave, error }: { settings: any; canWrite: boolean; onSave: (v: any) => void; error: string | null }) {
  const [d, setD] = useState<string | null>(null);
  const date = d ?? (settings.decisionDate || '');
  const nr = settings.noReason || {};
  const box = 'h-8 bg-transparent border-b border-[#8d8d8d] px-1 text-[14px] text-[#161616] outline-none focus:border-[#0f62fe]';
  const commit = () => { if (d === null) return; if (d.trim() !== (settings.decisionDate || '')) onSave({ decisionDate: d.trim() }); setD(null); };
  if (!canWrite) return <><span className="ml-6 text-[#525252]">Decision date</span><span>{settings.decisionDate || 'Today'}</span><span className="ml-6 text-[#525252]">No reason</span><span>{nr.outcome || 'Approve'}{nr.result && nr.result !== nr.outcome ? ` · ${nr.result}` : ''}</span></>;
  return (
    <>
      <label htmlFor="tp-asof" className="ml-6 text-[#525252]">Decision date</label>
      <input id="tp-asof" className={`${box} w-[120px] tabular-nums`} placeholder="Today" value={date} onChange={e => setD(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') setD(null); }} />
      <span className="ml-6 text-[#525252]">No reason</span>
      <ValueCombo className={`${box} w-[110px]`} value={nr.outcome || ''} placeholder="Approve" ariaLabel="Final decision when no reason fires" values={OUTS} onChange={v => onSave({ noReason: { outcome: v } })} />
      <ValueCombo className={`${box} w-[110px]`} value={nr.result || ''} placeholder={nr.outcome || 'Approve'} ariaLabel="Result when no reason fires" values={OUTS} onChange={v => onSave({ noReason: { result: v } })} />
      {error && <span className="text-[#da1e28]">{error}</span>}
    </>
  );
}

/** Which words receive the topic's answer: the top reason's result, the final decision, the list of reasons. */
function TopicOutputs({ projectId, settings, canWrite, onSave }: { projectId: string; settings: any; canWrite: boolean; onSave: (v: any) => void }) {
  const { terms, label } = useTerms(projectId);
  const o = settings.outputs || {};
  const box = 'h-8 bg-transparent border-b border-[#8d8d8d] px-1 text-[14px] text-[#161616] outline-none focus:border-[#0f62fe] min-w-[170px]';
  const words = terms.map(t => t.term);
  const pathOf = (v: string) => { const x = v.trim(); if (!x) return ''; return terms.find(t => t.term === x || t.path === x)?.path || x; };
  const field = (k: 'result' | 'decision' | 'reasons', title: string) => (
    <><span className="ml-6 first:ml-0 text-[#525252]">{title}</span>
      {canWrite ? <ValueCombo className={box} value={o[k] ? label(o[k]) : ''} placeholder="No word" ariaLabel={title} values={words} onChange={v => onSave({ outputs: { [k]: pathOf(v) } })} />
        : <span>{o[k] ? label(o[k]) : 'No word'}</span>}</>
  );
  return (
    <div className="flex flex-wrap items-center gap-2 mt-2 text-[14px]">
      {field('result', 'Top reason result goes to')}{field('decision', 'Final decision goes to')}{field('reasons', 'Reasons go to')}
    </div>
  );
}
