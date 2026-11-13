'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Table, Td, Tag, Btn, Input, Panel, Notice } from '@/components/pipeline/ui';

export default function ApisPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', basePath: '', version: '1', description: '' });
  const { data: specs = [] } = useQuery({ queryKey: ['specs', projectId], queryFn: () => api.get<any[]>(`/platform/specs?project_id=${projectId}`) });
  const { data: traffic } = useQuery({ queryKey: ['traffic', projectId, 24], queryFn: () => api.get<any>(`/platform/monitor/traffic?project_id=${projectId}&hours=24`) });
  const callsBySpec: Record<string, number> = {};
  for (const o of traffic?.operations || []) callsBySpec[`${o.basePath}/v${o.version}`] = (callsBySpec[`${o.basePath}/v${o.version}`] || 0) + o.calls;
  const create = useMutation({ mutationFn: () => api.post<any>('/platform/specs', { projectId, name: f.name, basePath: f.basePath || undefined, version: Number(f.version) || 1, description: f.description }), onSuccess: s => router.push(`/projects/${projectId}/apis/${s.id}`) });
  return (
    <div className="px-8 py-6">
      <PageHead title="REST APIs" sub={`${specs.length} API · served at /api/{base path}/v{version}/…`} actions={<Btn onClick={() => setOpen(o => !o)}>New API</Btn>} />
      {open && (
        <Panel title="New API" className="mb-4">
          <div className="grid grid-cols-4 gap-4">
            <Input id="sp-name" label="Name" value={f.name} onChange={(v: string) => setF({ ...f, name: v })} placeholder="NEB Pre-screening API" />
            <Input id="sp-base" label="Base path" mono value={f.basePath} onChange={(v: string) => setF({ ...f, basePath: v })} placeholder="neb-prescreen" />
            <Input id="sp-ver" label="Major version" mono value={f.version} onChange={(v: string) => setF({ ...f, version: v })} />
            <Input id="sp-desc" label="Summary" value={f.description} onChange={(v: string) => setF({ ...f, description: v })} />
          </div>
          {create.error && <div className="mt-3"><Notice kind="error">{String((create.error as any).message)}</Notice></div>}
          <div className="mt-4 flex gap-2"><Btn onClick={() => create.mutate()} disabled={!f.name || create.isPending}>Create</Btn><Btn kind="ghost" onClick={() => setOpen(false)}>Cancel</Btn></div>
        </Panel>
      )}
      <Table head={['API', 'Path', 'Operations', 'Status', 'Calls today']} empty={!specs.length ? <div className="px-4 py-8 text-[14px] text-[#525252]">No APIs yet</div> : null}>
        {specs.map((s: any) => (
          <tr key={s.id} className="hover:bg-[#e8e8e8] cursor-pointer" onClick={() => router.push(`/projects/${projectId}/apis/${s.id}`)}>
            <Td><div className="font-semibold">{s.name}</div><div className="text-[12px] text-[#525252]">{s.description}</div></Td>
            <Td mono>{s.url}</Td>
            <Td>{(s.operations || []).map((o: any) => <span key={o.id} className="mr-2 font-mono text-[12px]"><b>{o.method}</b> {o.path}</span>)}</Td>
            <Td>{s.status === 'published' ? <Tag tone="green">Live · rev {s.revision - 1}</Tag> : <Tag>Draft</Tag>}{s.reviewState === 'PENDING' && <span className="ml-1"><Tag tone="orange">In review</Tag></span>}</Td>
            <Td mono>{(callsBySpec[`${s.basePath}/v${s.version}`] || 0).toLocaleString()}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
