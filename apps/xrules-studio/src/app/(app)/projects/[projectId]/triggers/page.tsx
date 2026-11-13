'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Table, Td, Tag, Btn, Input, Panel, fmtTime, cronText } from '@/components/pipeline/ui';
import { Dropdown } from '@/components/pipeline/Dropdown';

const TYPE: Record<string, string> = { schedule: 'Schedule', webhook: 'Webhook', manual: 'Manual', data_sync: 'Data Set sync' };

export default function TriggersPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter(); const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', type: 'schedule', cron: '0 23 * * *' });
  const { data: rows = [] } = useQuery({ queryKey: ['triggers', projectId], queryFn: () => api.get<any[]>(`/platform/triggers?project_id=${projectId}`), refetchInterval: 10000 });
  const run = useMutation({ mutationFn: (id: string) => api.post(`/platform/triggers/${id}/run`), onSettled: () => setTimeout(() => qc.invalidateQueries({ queryKey: ['triggers', projectId] }), 2500) });
  const create = useMutation({
    mutationFn: async () => {
      if (f.type === 'data_sync') { router.push(`/projects/${projectId}/data-flows`); return null; }
      return api.post<any>('/flows', { name: f.name, projectId, kind: 'TRIGGER', graph: { nodes: [
        { id: 'trigger', type: 'trigger', position: { x: 40, y: 60 }, data: { label: TYPE[f.type], type: f.type, cron: f.type === 'schedule' ? f.cron : undefined, secret: f.type === 'webhook' ? Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) : undefined } }],
        edges: [] } });
    },
    onSuccess: fl => fl && router.push(`/projects/${projectId}/flows/${fl.id}`),
  });
  return (
    <div className="px-8 py-6">
      <PageHead title="Triggers" sub={`${rows.length} triggers · started on a schedule, by webhook or by hand · includes Data Set syncs`} actions={<Btn onClick={() => setOpen(o => !o)}>New Trigger</Btn>} />
      {open && (
        <Panel title="New trigger" className="mb-4">
          <div className="grid grid-cols-3 gap-4">
            <Input id="tr-name" label="Name" value={f.name} onChange={(v: string) => setF({ ...f, name: v })} />
            <div><div className="text-[12px] text-[#525252] mb-1.5">Starts on</div><Dropdown value={f.type} onChange={v => setF({ ...f, type: v })} options={Object.entries(TYPE).map(([value, label]) => ({ value, label }))} /></div>
            {f.type === 'schedule' && <Input id="tr-cron" label="Schedule (cron)" mono value={f.cron} onChange={(v: string) => setF({ ...f, cron: v })} />}
          </div>
          <div className="mt-4"><Btn onClick={() => create.mutate()} disabled={(!f.name && f.type !== 'data_sync') || create.isPending}>Create</Btn></div>
        </Panel>
      )}
      <Table head={['Name', 'Starts on', 'Status', 'Last run', '']} empty={!rows.length ? <div className="px-4 py-8 text-[14px] text-[#525252]">No triggers yet</div> : null}>
        {rows.map((t: any) => (
          <tr key={t.id} className="hover:bg-[#e8e8e8] cursor-pointer" onClick={() => router.push(t.kind === 'data' ? `/projects/${projectId}/data-flows/${t.id}` : `/projects/${projectId}/flows/${t.id}`)}>
            <Td><div className="font-semibold">{t.name}</div><div className="font-mono text-[12px] text-[#525252]">{t.slug}</div></Td>
            <Td>{TYPE[t.type] || t.type}{t.cron && <span className="text-[#525252]"> · {cronText(t.cron)}</span>}{t.webhookPath && <span className="font-mono text-[12px] text-[#525252]"> · POST {t.webhookPath}</span>}</Td>
            <Td>{t.status === 'published' ? (t.enabled ? <Tag tone="green">Enabled</Tag> : <Tag>Disabled</Tag>) : <Tag>Draft</Tag>}</Td>
            <Td>{t.last ? <span className="flex items-center gap-2">{t.last.ok ? <Tag tone="green">Succeeded</Tag> : <Tag tone="red">Failed</Tag>}<span className="text-[12px] text-[#525252]">{fmtTime(t.last.at)}</span></span> : '—'}</Td>
            <Td><button className="h-8 px-3 text-[#0f62fe] hover:bg-[#e0e0e0] disabled:opacity-40" disabled={t.status !== 'published'} onClick={e => { e.stopPropagation(); run.mutate(t.id); }}>Run now</button></Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
