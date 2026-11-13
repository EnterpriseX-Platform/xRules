'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Table, Td, Tag, Btn, Input, TextArea, Panel, Notice, Tabs } from '@/components/pipeline/ui';
import { Dropdown } from '@/components/pipeline/Dropdown';
import { TraceView } from '@/components/pipeline/TraceView';

const METHOD_TONE: Record<string, any> = { GET: 'blue', POST: 'green', PUT: 'orange', PATCH: 'orange', DELETE: 'red' };

export default function SpecPage() {
  const { projectId, specId } = useParams<{ projectId: string; specId: string }>();
  const qc = useQueryClient();
  const [tab, setTab] = useState('Operations');
  const { data: s } = useQuery({ queryKey: ['spec', specId], queryFn: () => api.get<any>(`/platform/specs/${specId}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['spec', specId] });
  const publish = useMutation({ mutationFn: () => api.post(`/platform/specs/${specId}/publish`, {}), onSuccess: refresh });
  const submit = useMutation({ mutationFn: () => api.post('/platform/reviews', { targetType: 'api_spec', targetId: specId }), onSuccess: refresh });
  if (!s) return <div className="px-8 py-6" />;
  return (
    <div className="px-8 py-6">
      <PageHead title={s.name} sub={<><span className="font-mono">{s.url}</span> · {s.status === 'published' ? `ใช้งาน rev ${s.revision - 1}` : 'ร่าง'}{s.reviewState !== 'NONE' && ` · ตรวจ: ${s.reviewState.toLowerCase()}`}</>}
        actions={<>
          <Btn kind="tertiary" onClick={() => submit.mutate()} disabled={submit.isPending}>ส่งตรวจ</Btn>
          <Btn onClick={() => publish.mutate()} disabled={publish.isPending}>Publish</Btn>
        </>} />
      {(publish.error || submit.error) && <div className="mb-4"><Notice kind="error">{String(((publish.error || submit.error) as any).message)}</Notice></div>}
      {publish.isSuccess && <div className="mb-4"><Notice kind="success">เปิดใช้แล้วที่ {s.url}</Notice></div>}
      <Tabs tabs={['Operations', 'ลองเรียก', 'เอกสาร']} value={tab} onChange={setTab} />
      {tab === 'Operations' && <Operations spec={s} projectId={projectId} onChange={refresh} />}
      {tab === 'ลองเรียก' && <TryIt spec={s} />}
      {tab === 'เอกสาร' && <Docs specId={specId} />}
    </div>
  );
}

function Operations({ spec, projectId, onChange }: any) {
  const [f, setF] = useState({ method: 'POST', path: '', summary: '', schema: '' });
  const add = useMutation({ mutationFn: () => api.post(`/platform/specs/${spec.id}/operations`, { method: f.method, path: f.path, summary: f.summary, requestSchema: f.schema ? JSON.parse(f.schema) : undefined }), onSuccess: () => { setF({ method: 'POST', path: '', summary: '', schema: '' }); onChange(); } });
  const del = useMutation({ mutationFn: (id: string) => api.del(`/platform/operations/${id}`), onSuccess: onChange });
  return (
    <div className="space-y-4">
      <Table head={['Method', 'Path', 'คำอธิบาย', 'Flow', '']} empty={!spec.operations?.length ? <div className="px-4 py-6 text-[14px] text-[#525252]">ยังไม่มี operation</div> : null}>
        {(spec.operations || []).map((o: any) => (
          <tr key={o.id}>
            <Td><Tag tone={METHOD_TONE[o.method]}>{o.method}</Tag></Td>
            <Td mono>{o.path}</Td>
            <Td>{o.summary}</Td>
            <Td><Link className="text-[#0f62fe] hover:underline" href={`/projects/${projectId}/flows/${o.flowId}`}>แก้ flow ({o.flow?.nodes} ขั้น)</Link></Td>
            <Td><button className="h-8 px-3 text-[#da1e28] hover:bg-[#fff1f1]" onClick={() => del.mutate(o.id)}>ลบ</button></Td>
          </tr>
        ))}
      </Table>
      <Panel title="เพิ่ม operation">
        <div className="grid grid-cols-[140px_1fr_1fr] gap-4">
          <div><div className="text-[12px] text-[#525252] mb-1.5">Method</div><Dropdown value={f.method} onChange={v => setF({ ...f, method: v })} options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => ({ value: m, label: m }))} /></div>
          <Input id="op-path" label="Path (ใส่พารามิเตอร์แบบ {itemCode})" mono value={f.path} onChange={(v: string) => setF({ ...f, path: v })} placeholder="/standard-price/{itemCode}" />
          <Input id="op-sum" label="คำอธิบาย" value={f.summary} onChange={(v: string) => setF({ ...f, summary: v })} />
        </div>
        <div className="mt-4"><TextArea id="op-schema" label="JSON Schema ของ body (ไม่ใส่ก็ได้)" rows={4} value={f.schema} onChange={(v: string) => setF({ ...f, schema: v })} /></div>
        {add.error && <div className="mt-3"><Notice kind="error">{String((add.error as any).message)}</Notice></div>}
        <div className="mt-4"><Btn onClick={() => add.mutate()} disabled={!f.path || add.isPending}>เพิ่ม</Btn></div>
      </Panel>
    </div>
  );
}

function TryIt({ spec }: any) {
  const ops = spec.operations || [];
  const [opId, setOpId] = useState<string>(ops[0]?.id || '');
  const op = ops.find((o: any) => o.id === opId);
  const params = op ? [...op.path.matchAll(/\{(\w+)\}/g)].map((m: any) => m[1]) : [];
  const [pv, setPv] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [body, setBody] = useState('{\n  \n}');
  const run = useMutation({ mutationFn: () => api.post<any>(`/platform/operations/${opId}/try`, { params: pv, query: Object.fromEntries(new URLSearchParams(query)), body: body.trim() ? JSON.parse(body) : {} }) });
  return (
    <div className="grid grid-cols-2 gap-4 items-start">
      <Panel title="คำขอ (รันกับร่างล่าสุด)">
        <div className="space-y-4">
          <div><div className="text-[12px] text-[#525252] mb-1.5">Operation</div><Dropdown value={opId} onChange={setOpId} options={ops.map((o: any) => ({ value: o.id, label: `${o.method} ${o.path}` }))} /></div>
          {params.map((p: string) => <Input key={p} id={`pp-${p}`} label={`{${p}}`} mono value={pv[p]} onChange={(v: string) => setPv({ ...pv, [p]: v })} />)}
          <Input id="try-q" label="Query string" mono value={query} onChange={setQuery} placeholder="fiscalYear=2571" />
          {op?.method !== 'GET' && <TextArea id="try-body" label="Body (JSON)" rows={10} value={body} onChange={setBody} />}
          <Btn onClick={() => run.mutate()} disabled={!opId || run.isPending}>ส่ง</Btn>
        </div>
      </Panel>
      <Panel title={run.data ? <span className="flex items-center gap-2"><Tag tone={run.data.status < 300 ? 'green' : 'red'}>{run.data.status}</Tag><span className="text-[14px] text-[#525252]">{run.data.ms} ms</span></span> : 'ผลลัพธ์'}>
        {run.error && <Notice kind="error">{String((run.error as any).message)}</Notice>}
        {run.data && <>
          <pre className="bg-[#f4f4f4] p-3 text-[12px] font-mono overflow-auto max-h-[320px]">{JSON.stringify(run.data.body, null, 2)}</pre>
          <div className="mt-4 text-[14px] font-semibold mb-2">Rule Trace</div>
          <TraceView steps={run.data.trace || []} />
        </>}
      </Panel>
    </div>
  );
}

function Docs({ specId }: { specId: string }) {
  const { data } = useQuery({ queryKey: ['openapi', specId], queryFn: () => fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'}/platform/specs/${specId}/openapi.json`, { headers: { Authorization: `Bearer ${localStorage.getItem('xrules_token') || ''}` } }).then(r => r.json()) });
  if (!data) return null;
  return (
    <div className="space-y-3">
      {Object.entries(data.paths || {}).flatMap(([p, ms]: any) => Object.entries(ms).map(([m, op]: any) => (
        <Panel key={`${m}${p}`} title={<span className="font-mono text-[14px]"><Tag tone={METHOD_TONE[m.toUpperCase()]}>{m.toUpperCase()}</Tag> {data.servers?.[0]?.url}{p}</span>}>
          <div className="text-[14px] mb-2">{op.summary}</div>
          {op.requestBody && <pre className="bg-[#f4f4f4] p-3 text-[12px] font-mono overflow-auto">{JSON.stringify(op.requestBody.content['application/json'].schema, null, 2)}</pre>}
          <div className="text-[12px] text-[#525252] mt-2">ส่ง header <span className="font-mono">X-API-Key</span> · ตอบ 400 ถ้าข้อมูลไม่ตรง schema · 403 ถ้า key ไม่มีสิทธิ์ · 429 ถ้าเรียกเกินกำหนด</div>
        </Panel>
      )))}
      <pre className="bg-white p-4 text-[12px] font-mono overflow-auto max-h-[400px]">{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
