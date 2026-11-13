'use client';
// API Keys: one key per calling system; which APIs it may call, limit per minute, expiry, on/off.
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiKeysApi } from '@/lib/api';
import { useAuth } from '@/lib/store';
import { PageHead, Table, Td, Tag, Btn, Input, Panel, Notice, Tabs, fmtTime } from '@/components/pipeline/ui';

export default function ApiKeysPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();
  const ws = useAuth((s: any) => s.workspace);
  const tenant = useAuth((s: any) => s.user?.tenantId);
  const wsSlug = ws?.slug || tenant || '';
  const [tab, setTab] = useState('Keys');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ name: '', systemName: '', specIds: [] as string[], rate: '600', days: '' });
  const [created, setCreated] = useState<any>(null);
  const { data: keys = [] } = useQuery({ queryKey: ['keys', wsSlug], queryFn: () => apiKeysApi.list(wsSlug) });
  const { data: specs = [] } = useQuery({ queryKey: ['specs', projectId], queryFn: () => api.get<any[]>(`/platform/specs?project_id=${projectId}`) });
  const specName: Record<string, string> = Object.fromEntries((specs as any[]).map(s => [s.id, `${s.name} (${s.url})`]));
  const inv = () => qc.invalidateQueries({ queryKey: ['keys', wsSlug] });
  const create = useMutation({ mutationFn: () => api.post<any>('/api-keys', { name: f.name, systemName: f.systemName, specIds: f.specIds, rateLimitPerMin: Number(f.rate) || 600, expiresInDays: f.days ? Number(f.days) : undefined, workspaceSlug: wsSlug }), onSuccess: k => { setCreated(k); setOpen(false); inv(); } });
  const upd = useMutation({ mutationFn: ({ id, body }: any) => api.put(`/api-keys/${id}`, body), onSuccess: inv });
  const toggleSpec = (id: string) => setF({ ...f, specIds: f.specIds.includes(id) ? f.specIds.filter((x: string) => x !== id) : [...f.specIds, id] });
  return (
    <div className="px-8 py-6">
      <PageHead title="API Keys" sub="One key per calling system · choose which APIs it may call" actions={tab === 'Keys' ? <Btn onClick={() => setOpen(o => !o)}>New Key</Btn> : undefined} />
      <Tabs tabs={['Keys', 'Webhooks']} value={tab} onChange={setTab} />
      {tab === 'Keys' && <>
        {created && <div className="mb-4"><Notice kind="success">Key created. Copy it now; it will not be shown again<div className="font-mono text-[13px] mt-2 bg-white px-2 py-1 select-all">{created.key}</div></Notice></div>}
        {open && (
          <Panel title="New key" className="mb-4">
            <div className="grid grid-cols-4 gap-4">
              <Input id="k-name" label="Name" value={f.name} onChange={(v: string) => setF({ ...f, name: v })} placeholder="bpn-prod" />
              <Input id="k-sys" label="Calling system" value={f.systemName} onChange={(v: string) => setF({ ...f, systemName: v })} placeholder="BPN" />
              <Input id="k-rate" label="Requests per minute" mono value={f.rate} onChange={(v: string) => setF({ ...f, rate: v })} />
              <Input id="k-days" label="Expires in (days)" mono value={f.days} onChange={(v: string) => setF({ ...f, days: v })} placeholder="Never" />
            </div>
            <div className="mt-4 text-[12px] text-[#525252] mb-1.5">May call</div>
            <div className="space-y-1">{(specs as any[]).map(s => <label key={s.id} className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={f.specIds.includes(s.id)} onChange={() => toggleSpec(s.id)} />{s.name} <span className="font-mono text-[12px] text-[#525252]">{s.url}</span></label>)}</div>
            {create.error && <div className="mt-3"><Notice kind="error">{String((create.error as any).message)}</Notice></div>}
            <div className="mt-4"><Btn onClick={() => create.mutate()} disabled={!f.name || create.isPending}>Create</Btn></div>
          </Panel>
        )}
        <Table head={['Key', 'System', 'May call', 'Per minute', 'Expires', 'Last used', 'Active']} empty={!keys.length ? <div className="px-4 py-6 text-[14px] text-[#525252]">No keys yet</div> : null}>
          {(keys as any[]).map(k => {
            const expiring = k.expiresAt && new Date(k.expiresAt).getTime() - Date.now() < 14 * 86400_000;
            return (
              <tr key={k.id}>
                <Td><div className="font-semibold">{k.name}</div><div className="font-mono text-[12px] text-[#525252]">{k.prefix}</div></Td>
                <Td>{k.systemName || '—'}</Td>
                <Td className="!whitespace-normal text-[13px]">{(k.specIds || []).map((id: string) => specName[id] || id.slice(0, 8)).join(', ') || <span className="text-[#a2191f]">No APIs allowed yet</span>}</Td>
                <Td mono>{k.rateLimitPerMin}</Td>
                <Td>{k.expiresAt ? (expiring ? <Tag tone="orange">{fmtTime(k.expiresAt)}</Tag> : fmtTime(k.expiresAt)) : 'Never'}</Td>
                <Td>{fmtTime(k.lastUsedAt)}</Td>
                <Td><input type="checkbox" checked={k.active !== false} onChange={e => upd.mutate({ id: k.id, body: { active: e.target.checked } })} /></Td>
              </tr>
            );
          })}
        </Table>
      </>}
      {tab === 'Webhooks' && <WebhooksTab />}
    </div>
  );
}

function WebhooksTab() {
  const { data: hooks = [] } = useQuery({ queryKey: ['webhooks'], queryFn: () => api.get<any[]>('/webhooks') });
  return (
    <Table head={['Name', 'URL', 'Events', 'Status']} empty={!(hooks as any[]).length ? <div className="px-4 py-6 text-[14px] text-[#525252]">No webhooks yet</div> : null}>
      {(hooks as any[]).map(h => <tr key={h.id}><Td>{h.name}</Td><Td mono>{h.url}</Td><Td className="text-[13px]">{(h.events || []).join(', ')}</Td><Td>{h.active ? <Tag tone="green">On</Tag> : <Tag>Off</Tag>}</Td></tr>)}
    </Table>
  );
}
