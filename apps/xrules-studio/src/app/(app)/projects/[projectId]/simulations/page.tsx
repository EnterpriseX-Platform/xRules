'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Table, Td, Tag, Btn, Input, Panel, Notice, fmtTime, pct } from '@/components/pipeline/ui';
import { Dropdown } from '@/components/pipeline/Dropdown';

export default function SimulationsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();
  const { data: flows = [] } = useQuery({ queryKey: ['flows-all', projectId], queryFn: () => api.get<any[]>(`/flows?project_id=${projectId}`) });
  const decision = (flows as any[]).filter(f => f.kind === 'decision');
  const [flow, setFlow] = useState(''); const [limit, setLimit] = useState('1000'); const [rate, setRate] = useState('20'); const [until, setUntil] = useState('');
  const { data: runs = [] } = useQuery({ queryKey: ['bulk', projectId], queryFn: () => api.get<any[]>(`/platform/bulk?project_id=${projectId}`), refetchInterval: 3000 });
  const pairs = (runs as any[]).filter(r => r.compareToId);
  const { data: ch } = useQuery({ queryKey: ['challenger', flow], queryFn: () => api.get<any>(`/platform/flows/${flow}/challenger`), enabled: !!flow });
  const backtest = useMutation({ mutationFn: () => api.post<any>('/platform/simulations/backtest', { projectId, flow, limit: Number(limit) || 1000 }), onSuccess: () => qc.invalidateQueries({ queryKey: ['bulk', projectId] }) });
  const setCh = useMutation({ mutationFn: (off: boolean) => api.put(`/platform/flows/${flow}/challenger`, off ? { off: true } : { sampleRate: (Number(rate) || 20) / 100, until: until || null }), onSuccess: () => qc.invalidateQueries({ queryKey: ['challenger', flow] }) });
  const s = ch?.summary;
  return (
    <div className="px-8 py-6">
      <PageHead title="Simulations" sub="See how a draft would change results before it goes live" />
      <div className="w-96 mb-4"><div className="text-[12px] text-[#525252] mb-1.5">Decision Flow</div><Dropdown value={flow} onChange={setFlow} options={decision.map(f => ({ value: f.id, label: f.name, hint: `v${f.version}` }))} /></div>
      <div className="grid grid-cols-2 gap-4 items-start">
        <Panel title="Backtest">
          <div className="text-[14px] text-[#525252] mb-3">Run the draft and the live version over past real requests and compare each result</div>
          <Input id="bt-lim" label="Most recent requests" mono value={limit} onChange={setLimit} />
          <div className="mt-4"><Btn onClick={() => backtest.mutate()} disabled={!flow || backtest.isPending}>Start backtest</Btn></div>
          {backtest.error && <div className="mt-3"><Notice kind="error">{String((backtest.error as any).message)}</Notice></div>}
        </Panel>
        <Panel title="Champion / Challenger on live traffic">
          <div className="text-[14px] text-[#525252] mb-3">Run the draft alongside the live version on a share of real requests; callers always get the live result</div>
          {ch?.challenger ? <Notice kind="info">Comparing {Math.round(ch.challenger.sampleRate * 100)}% of requests{ch.challenger.until ? ` until ${fmtTime(ch.challenger.until)}` : ''}</Notice> : null}
          <div className="grid grid-cols-2 gap-4 mt-3">
            <Input id="ch-rate" label="Share of requests (%)" mono value={rate} onChange={setRate} />
            <Input id="ch-until" label="Ends on" type="date" value={until} onChange={setUntil} />
          </div>
          <div className="mt-4 flex gap-2">
            <Btn onClick={() => setCh.mutate(false)} disabled={!flow}>{ch?.challenger ? 'Update' : 'Start comparing'}</Btn>
            {ch?.challenger && <Btn kind="ghost" onClick={() => setCh.mutate(true)}>Stop</Btn>}
          </div>
          {s && s.total > 0 && <div className="mt-4 text-[14px] tabular-nums">Compared {s.total.toLocaleString()} requests · same result <b>{pct(s.same, s.total)}%</b> · different <b>{s.different.toLocaleString()}</b></div>}
        </Panel>
      </div>
      <h2 className="text-[20px] mt-8 mb-3">Backtest results</h2>
      <Table head={['Run', 'Status', 'Progress', '']} empty={!pairs.length ? <div className="px-4 py-6 text-[14px] text-[#525252]">None yet</div> : null}>
        {pairs.map((r: any) => (
          <tr key={r.id}><Td>{r.name}</Td><Td><Tag tone={r.status === 'COMPLETED' ? 'green' : 'blue'}>{r.status === 'COMPLETED' ? 'Completed' : 'Running'}</Tag></Td>
            <Td mono>{r.processed}/{r.total}</Td><Td><Link className="text-[#0f62fe] hover:underline" href={`/projects/${projectId}/bulk/${r.id}`}>View differences</Link></Td></tr>
        ))}
      </Table>
    </div>
  );
}
