'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Table, Td, Tag, Btn, Input, Panel, fmtTime, cronText, Modal } from '@/components/pipeline/ui';
import { Dropdown } from '@/components/pipeline/Dropdown';
import { usePerms } from '@/lib/perms';

const TYPE: Record<string, string> = { schedule: 'Schedule', webhook: 'Webhook', manual: 'Manual', data_sync: 'Data Set sync' };

export default function TriggersPage() {
  const perms = usePerms();
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter(); const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', type: 'schedule', cron: '0 23 * * *' });
  const { data: rows = [] } = useQuery({ queryKey: ['triggers', projectId], queryFn: () => api.get<any[]>(`/platform/triggers?project_id=${projectId}`), refetchInterval: 10000 });
  const run = useMutation({ meta: { failLabel: "Couldn't run" }, mutationFn: (id: string) => api.post(`/platform/triggers/${id}/run`), onSettled: () => setTimeout(() => qc.invalidateQueries({ queryKey: ['triggers', projectId] }), 2500) });
  const create = useMutation({
    mutationFn: async () => {
      if (f.type === 'data_sync') { router.push(projectId.startsWith('_') ? '/data-sets' : `/p/${projectId}/data-flows`); return null; }
      return api.post<any>('/flows', { name: f.name, projectId, kind: 'TRIGGER', graph: { nodes: [
        { id: 'trigger', type: 'trigger', position: { x: 40, y: 60 }, data: { label: TYPE[f.type], type: f.type, cron: f.type === 'schedule' ? f.cron : undefined, secret: f.type === 'webhook' ? Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) : undefined } }],
        edges: [] } });
    },
    onSuccess: fl => fl && router.push(projectId.startsWith('_') ? `/triggers/${fl.id}` : `/p/${projectId}/flows/${fl.id}`),
  });
  return (
    <div className="px-8 py-6">
      <PageHead title="Triggers" sub={`${rows.length} triggers · started on a schedule, by webhook or by hand · includes Data Set syncs`} actions={perms.integrate ? (<Btn onClick={() => setOpen(true)}>New Trigger</Btn>) : undefined} />
      {open && (
        <Modal title="New trigger" onClose={() => setOpen(false)} wide onSubmit={() => create.mutate()} submitLabel="Create" submitDisabled={(!f.name && f.type !== 'data_sync') || create.isPending}>
          <div className="grid grid-cols-3 gap-4">
            <Input id="tr-name" label="Name" value={f.name} onChange={(v: string) => setF({ ...f, name: v })} />
            <div><div className="text-[12px] text-[#525252] mb-1.5">Starts on</div><Dropdown value={f.type} onChange={v => setF({ ...f, type: v })} options={Object.entries(TYPE).map(([value, label]) => ({ value, label }))} /></div>
            {f.type === 'schedule' && <Input id="tr-cron" label="Schedule (cron)" mono value={f.cron} onChange={(v: string) => setF({ ...f, cron: v })} />}
          </div>
        </Modal>
      )}
      <Table head={['Name', 'Starts on', 'Status', 'Last run', '']} empty={!rows.length ? <div className="px-4 py-8 text-[14px] text-[#525252]">No triggers yet</div> : null}>
        {rows.map((t: any) => (
          <tr key={t.id} className="hover:bg-[#e8e8e8] cursor-pointer" onClick={() => router.push(projectId.startsWith('_') ? (t.kind === 'data' ? `/data-sets/syncs/${t.id}` : `/triggers/${t.id}`) : (t.kind === 'data' ? `/p/${projectId}/data-flows/${t.id}` : `/p/${projectId}/flows/${t.id}`))}>
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
