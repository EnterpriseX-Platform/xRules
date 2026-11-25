'use client';
// Simulate a topic's decision on real data: live version beside the draft, in counts and money.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, flowsApi } from '@/lib/api';
import { Dropdown } from '@/components/pipeline/Dropdown';
import { Btn } from '@/components/pipeline/ui';
import { useTerms } from '@/lib/terms';

const n = (v: any) => (v == null || isNaN(Number(v)) ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }));
const delta = (a: any, b: any) => { if (a == null || b == null) return null; const d = Number(b) - Number(a); return d === 0 ? 'no change' : `${d > 0 ? '+' : ''}${n(d)}`; };

export function TopicSimulate({ projectId, topicId, decisions, last }: { projectId: string; topicId: string; decisions: any[]; last?: any }) {
  const qc = useQueryClient();
  const { label } = useTerms(projectId);
  const [decisionId, setDecisionId] = useState<string>(last?.decisionId || decisions[0]?.id || '');
  const [dataset, setDataset] = useState<string>(last?.dataset || '');
  const [input, setInput] = useState<Record<string, any>>({});
  const d = decisions.find(x => x.id === decisionId);
  const isFlow = d?.kind === 'flow';
  const { data: sets = [] } = useQuery({ queryKey: ['datasets', projectId], queryFn: () => api.get<any[]>(`/datasets?project_id=${projectId}`) });
  const { data: flow } = useQuery({ queryKey: ['flow', decisionId], queryFn: () => flowsApi.get(decisionId), enabled: !!isFlow });
  const asks: string[] = isFlow ? ((flow?.graph?.nodes || []) as any[]).filter(x => x.type === 'pick' && x.data?.mode === 'budget' && typeof x.data.budget === 'string').map(x => x.data.budget) : [];
  const [res, setRes] = useState<any>(last && last.decisionId === decisionId ? last : null);
  const run = useMutation({ meta: { silent: true },
    mutationFn: (attach: boolean) => api.post<any>(`/platform/topics/${topicId}/simulate`, { decisionId, dataset: isFlow ? undefined : dataset, input, attach }),
    onSuccess: r => { setRes(r); qc.invalidateQueries({ queryKey: ['topic', topicId] }); qc.invalidateQueries({ queryKey: ['reviews', projectId] }); } });
  const r = res && res.decisionId === decisionId ? res : null;
  if (!decisions.length) return <div className="bg-white border border-[#e0e0e0] px-5 py-8 text-[14px] text-[#525252]">No decisions to simulate yet</div>;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#e0e0e0] p-5 grid gap-4 md:grid-cols-[1fr_1fr_auto] items-end">
        <div><div className="text-[12px] text-[#525252] mb-1">Decision</div>
          <Dropdown value={decisionId} onChange={v => { setDecisionId(v); setRes(null); }} options={decisions.map(x => ({ value: x.id, label: x.name, hint: x.kind === 'flow' ? 'Strategy' : x.type === 'FORMULA' ? 'Calculation' : 'Rules' }))} /></div>
        {isFlow ? (
          <div className="grid gap-3 grid-cols-1">{asks.map(a => (
            <label key={a} className="block"><span className="block text-[12px] text-[#525252] mb-1">{label(a)}</span>
              <input className="h-10 w-full px-3 bg-[#f4f4f4] border-b border-[#8d8d8d] text-[14px] tabular-nums outline-none focus:outline focus:outline-2 focus:outline-[#0f62fe] focus:-outline-offset-2"
                value={input[a] == null ? '' : Number(input[a]).toLocaleString('en-US')} onChange={e => { const v = e.target.value.replace(/,/g, ''); setInput({ ...input, [a]: v === '' ? undefined : Number(v) }); }} /></label>))}
          </div>
        ) : (
          <div><div className="text-[12px] text-[#525252] mb-1">Data set</div>
            <Dropdown value={dataset} placeholder="Choose a data set" onChange={setDataset} options={(sets as any[]).map(s => ({ value: s.slug, label: s.name || s.slug, hint: s.rowCount ? `${n(s.rowCount)} rows` : undefined }))} /></div>
        )}
        <div className="flex gap-2">
          <Btn onClick={() => run.mutate(false)} disabled={run.isPending || (!isFlow && !dataset)}>{run.isPending ? 'Running' : 'Run simulation'}</Btn>
          {d?.reviewState === 'PENDING' && <Btn kind="secondary" onClick={() => run.mutate(true)} disabled={run.isPending || (!isFlow && !dataset)}>Run and attach to approval</Btn>}
        </div>
      </div>
      {run.error && <div className="text-[14px] text-[#da1e28]">{String((run.error as any).message)}</div>}
      {r?.attachedTo && <div className="text-[14px] text-[#198038]">Attached to the approval request</div>}
      {r && <SimResult r={r} label={label} />}
    </div>
  );
}

export function SimResult({ r, label }: { r: any; label: (k: string) => string }) {
  const head = (
    <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] bg-[#e0e0e0] text-[12px] text-[#161616] font-semibold"><div className="px-4 h-10 flex items-center">Measure</div><div className="px-4 h-10 flex items-center justify-end">Live{r.liveVersion ? ` v${r.liveVersion}` : ''}</div><div className="px-4 h-10 flex items-center justify-end">Draft</div><div className="px-4 h-10 flex items-center justify-end">Change</div></div>
  );
  const row = (k: string, a: any, b: any, money = false) => (
    <div key={k} className="grid grid-cols-[1.4fr_1fr_1fr_1fr] border-t border-[#e0e0e0] text-[14px]"><div className="px-4 py-3">{k}</div><div className="px-4 py-3 text-right tabular-nums">{a === undefined ? '—' : n(a)}</div><div className="px-4 py-3 text-right tabular-nums font-semibold">{n(b)}</div><div className="px-4 py-3 text-right tabular-nums text-[#525252]">{delta(a, b) ?? ''}{money ? '' : ''}</div></div>
  );
  if (r.kind === 'strategy') {
    const L = r.live, D = r.draft;
    return (
      <div className="space-y-6">
        {D?.error && <div className="text-[14px] text-[#da1e28]">Draft failed: {D.error}</div>}
        <div className="bg-white border border-[#e0e0e0]">{head}
          {row('Chosen', L?.picked, D?.picked)}{row('Not chosen', L?.dropped, D?.dropped)}
          {D?.allocation && <>{row('Budget', L?.allocation?.budget, D.allocation.budget)}{row('Used', L?.allocation?.used, D.allocation.used)}{row('Left', L?.allocation?.left, D.allocation.left)}</>}
        </div>
        {!L && <div className="text-[14px] text-[#525252]">No live version yet, so the draft is shown alone</div>}
        {(r.newlyChosen?.length > 0 || r.noLongerChosen?.length > 0) && (
          <div className="grid gap-6 md:grid-cols-2">
            <List title={`Newly chosen ${r.newlyChosen.length}`} items={r.newlyChosen.map((x: any) => ({ a: String(x) }))} />
            <List title={`No longer chosen ${r.noLongerChosen.length}`} items={r.noLongerChosen.map((x: any) => ({ a: String(x) }))} />
          </div>
        )}
        {r.whyNot?.length > 0 && <List title={`Why not chosen ${r.whyNot.length}`} items={r.whyNot.map((x: any) => ({ a: String(x.name ?? '—'), b: `${x.step}: ${x.reason}` }))} />}
      </div>
    );
  }
  const keys = Array.from(new Set([...Object.keys(r.draft || {}), ...Object.keys(r.live || {})]));
  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#e0e0e0]">{head}
        {row('Rows', r.rows, r.rows)}
        {r.changedCount != null && row('Rows with a different result', 0, r.changedCount)}
        {keys.flatMap(k => {
          const a = r.live?.[k], b = r.draft?.[k];
          if ((b || a)?.kind === 'number') return [row(`Total ${label(k)}`, a?.sum, b?.sum), row(`Average ${label(k)}`, a ? a.sum / (a.count || 1) : undefined, b ? b.sum / (b.count || 1) : undefined)];
          const vals = Array.from(new Set([...Object.keys(a?.values || {}), ...Object.keys(b?.values || {})])).slice(0, 8);
          return vals.map(v => row(`${label(k)} is ${v}`, a ? a.values?.[v] || 0 : undefined, b?.values?.[v] || 0));
        })}
        {r.errors > 0 && row('Errors', undefined, r.errors)}
      </div>
      {r.changed?.length > 0 && <List title={`Changed results, first ${r.changed.length}`} items={r.changed.map((c: any) => ({ a: String(c.name ?? '—'), b: `Live ${JSON.stringify(c.live)} · Draft ${JSON.stringify(c.draft)}` }))} />}
    </div>
  );
}

function List({ title, items }: { title: string; items: { a: string; b?: string }[] }) {
  return (
    <div className="bg-white border border-[#e0e0e0]">
      <div className="px-4 h-11 flex items-center text-[14px] font-semibold border-b border-[#e0e0e0]">{title}</div>
      <div className="max-h-[360px] overflow-y-auto">{items.map((x, i) => <div key={i} className="px-4 py-2 border-b border-[#e0e0e0] last:border-b-0 text-[14px]"><div>{x.a}</div>{x.b && <div className="text-[12px] text-[#525252] break-all">{x.b}</div>}</div>)}</div>
    </div>
  );
}
