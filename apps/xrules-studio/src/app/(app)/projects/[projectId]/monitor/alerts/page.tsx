'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Table, Td, Tag, Btn, Panel, Input, fmtTime } from '@/components/pipeline/ui';

export default function AlertsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['alerts', projectId], queryFn: () => api.get<any>(`/platform/alerts?project_id=${projectId}`), refetchInterval: 30000 });
  const [hook, setHook] = useState('');
  const upd = useMutation({ mutationFn: ({ id, body }: any) => api.put(`/platform/alerts/${id}`, body), onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts', projectId] }) });
  const ack = useMutation({ mutationFn: (id: string) => api.post(`/platform/alerts/events/${id}/ack`), onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts', projectId] }) });
  const evalNow = useMutation({ mutationFn: () => api.post('/platform/alerts/evaluate'), onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ['alerts', projectId] }), 2000) });
  if (!data) return <div className="px-8 py-6" />;
  return (
    <div className="px-8 py-6">
      <PageHead title="Alerts" sub="Checked every minute · delivered by webhook (works with Teams / LINE)" actions={<Btn kind="tertiary" onClick={() => evalNow.mutate()}>Evaluate now</Btn>} />
      <Panel title="Send alerts to" className="mb-4">
        <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
          <Input id="al-hook" label="Webhook URL (applies to every condition)" mono value={hook} onChange={setHook} placeholder="https://…" />
          <Btn onClick={() => data.rules.forEach((r: any) => upd.mutate({ id: r.id, body: { channels: hook ? [{ kind: 'webhook', url: hook }] : [] } }))}>Save</Btn>
        </div>
      </Panel>
      <Table head={['Condition', 'Threshold', 'Window', 'Send to', 'Enabled']}>
        {data.rules.map((r: any) => <tr key={r.id}><Td>{r.name}</Td><Td mono>{r.threshold}</Td><Td mono>{r.windowMin} min</Td><Td className="text-[12px]">{(r.channels || []).map((c: any) => c.url).join(', ') || '—'}</Td>
          <Td><input type="checkbox" checked={r.enabled} onChange={e => upd.mutate({ id: r.id, body: { enabled: e.target.checked } })} /></Td></tr>)}
      </Table>
      <h2 className="text-[20px] mt-8 mb-3">Alert history</h2>
      <Table head={['Condition', 'Status', 'Details', 'Started', 'Resolved', '']} empty={!data.events.length ? <div className="px-4 py-6 text-[14px] text-[#525252]">No alerts yet</div> : null}>
        {data.events.map((e: any) => <tr key={e.id}><Td>{e.rule.name}</Td><Td>{e.status === 'FIRING' ? <Tag tone="red">Firing</Tag> : <Tag tone="green">Resolved</Tag>}</Td><Td className="!whitespace-normal text-[13px]">{e.message}</Td><Td>{fmtTime(e.startedAt)}</Td><Td>{fmtTime(e.resolvedAt)}</Td>
          <Td>{e.status === 'FIRING' && !e.ackBy ? <button className="h-8 px-3 text-[#0f62fe] hover:bg-[#e8e8e8]" onClick={() => ack.mutate(e.id)}>Acknowledge</button> : e.ackBy ? <span className="text-[12px] text-[#525252]">Acknowledged by {e.ackBy}</span> : null}</Td></tr>)}
      </Table>
    </div>
  );
}
