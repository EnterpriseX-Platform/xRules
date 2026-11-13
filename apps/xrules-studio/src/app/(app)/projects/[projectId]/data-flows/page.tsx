'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Table, Td, Tag, Btn, fmtTime } from '@/components/pipeline/ui';

export default function DataFlowsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter(); const qc = useQueryClient();
  const { data: flows } = useQuery({ queryKey: ['data-flows', projectId], queryFn: () => api.get<any[]>(`/data/flows?project_id=${projectId}`) });
  const create = useMutation({
    mutationFn: () => api.post<any>('/flows', { name: `Data flow ${(flows?.length || 0) + 1}`, projectId, kind: 'DATA', schedule: { cron: '0 23 * * *' },
      graph: { nodes: [
        { id: 'trigger', type: 'trigger', position: { x: 40, y: 60 }, data: { label: 'ทุกคืน 23:00', cron: '0 23 * * *' } },
        { id: 'source', type: 'source', position: { x: 340, y: 60 }, data: { label: 'Source', sql: 'SELECT ' } },
        { id: 'write', type: 'write', position: { x: 640, y: 60 }, data: { label: 'Write Data Set' } }],
        edges: [{ id: 'e1', source: 'trigger', target: 'source' }, { id: 'e2', source: 'source', target: 'write' }] } }),
    onSuccess: f => router.push(`/projects/${projectId}/data-flows/${f.id}`),
  });
  const run = useMutation({ mutationFn: (id: string) => api.post(`/data/flows/${id}/run`), onSettled: () => qc.invalidateQueries({ queryKey: ['data-flows', projectId] }) });
  const failed = (flows || []).filter(f => f.lastRun?.state === 'ERROR').length;

  return (
    <div className="px-8 py-6">
      <PageHead title="Data Flows" sub={`${flows?.length ?? 0} flows${failed ? ` · ล้ม ${failed} รอบล่าสุด` : ''}`}
        actions={<Btn onClick={() => create.mutate()} disabled={create.isPending}>New Data Flow</Btn>} />
      <Table head={['ชื่อ', 'ต้นทาง → ปลายทาง', 'รอบ', 'รอบล่าสุด', 'แถว', 'รอบถัดไป', '']}
        empty={flows && !flows.length ? <div className="px-4 py-8 text-[14px] text-[#525252]">ยังไม่มี Data Flow</div> : null}>
        {(flows || []).map(f => (
          <tr key={f.id} className="hover:bg-[#e8e8e8] cursor-pointer" onClick={() => router.push(`/projects/${projectId}/data-flows/${f.id}`)}>
            <Td><div className="font-semibold">{f.name}</div><div className="font-mono text-[12px] text-[#525252]">{f.slug}{f.status !== 'published' && ' · draft'}</div></Td>
            <Td><span className="inline-flex items-center gap-2"><Tag>{f.source || '—'}</Tag>→{f.target ? <Link onClick={e => e.stopPropagation()} href={`/projects/${projectId}/data-sets?slug=${f.target}`}><Tag tone="green">{f.target}</Tag></Link> : '—'}</span></Td>
            <Td mono>{f.schedule?.cron || 'manual'}{f.schedule?.events?.length ? ` · ${f.schedule.events.join(', ')}` : ''}</Td>
            <Td>{f.lastRun ? <div className="flex flex-col py-1"><span>{f.lastRun.state === 'COMPLETED' ? <Tag tone="green">สำเร็จ</Tag> : f.lastRun.state === 'ERROR' ? <Tag tone="red">ล้ม</Tag> : <Tag tone="blue">{f.lastRun.state.toLowerCase()}</Tag>}</span>
              <span className={`text-[12px] mt-0.5 ${f.lastRun.state === 'ERROR' ? 'text-[#a2191f]' : 'text-[#525252]'}`}>{f.lastRun.state === 'ERROR' ? f.lastRun.error?.slice(0, 60) : `${fmtTime(f.lastRun.at)}${f.lastRun.ms != null ? ` · ${(f.lastRun.ms / 1000).toFixed(1)} วิ` : ''}`}</span></div> : '—'}</Td>
            <Td mono>{f.lastRun?.rows?.toLocaleString() ?? '—'}{f.lastRun?.rejected ? <span className="text-[#8a3800]"> (ตัด {f.lastRun.rejected})</span> : null}</Td>
            <Td>{fmtTime(f.nextRunAt)}</Td>
            <Td><button className="h-8 px-3 text-[#0f62fe] hover:bg-[#e0e0e0] disabled:opacity-40" disabled={f.status !== 'published' || run.isPending} onClick={e => { e.stopPropagation(); run.mutate(f.id); }}>รัน</button></Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
