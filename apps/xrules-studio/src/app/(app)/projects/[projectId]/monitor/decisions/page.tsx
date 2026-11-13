'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Table, Td, Tag, pct } from '@/components/pipeline/ui';

export default function DecisionsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: d } = useQuery({ queryKey: ['mon-dec', projectId], queryFn: () => api.get<any>(`/platform/monitor/decisions?project_id=${projectId}&hours=168`) });
  if (!d) return <div className="px-8 py-6" />;
  const max = Math.max(1, ...d.byRule.map((r: any) => r.n));
  return (
    <div className="px-8 py-6">
      <PageHead title="Decisions" sub={`7 วันล่าสุด · ตรวจ ${d.totals.total.toLocaleString()} คำขอ · ไม่ผ่าน ${d.totals.failed.toLocaleString()} (${pct(d.totals.failed, d.totals.total)}%)`} />
      <h2 className="text-[20px] mb-3">กฎที่พบบ่อย</h2>
      <Table head={['รหัสกฎ', 'ระดับ', 'จำนวน', '']}>
        {d.byRule.map((r: any) => <tr key={r.code + r.severity}><Td mono>{r.code}</Td><Td><Tag tone={r.severity === 'ERROR' ? 'red' : r.severity === 'WARNING' ? 'orange' : 'gray'}>{r.severity}</Tag></Td><Td mono>{r.n.toLocaleString()}</Td><Td><div className="w-64 h-2 bg-[#e0e0e0]"><div className="h-2 bg-[#0f62fe]" style={{ width: `${(r.n / max) * 100}%` }} /></div></Td></tr>)}
      </Table>
      <h2 className="text-[20px] mt-8 mb-3">แยกตามหน่วยรับงบ</h2>
      <Table head={['หน่วยรับงบ', 'คำขอ', 'มี finding']}>
        {d.byAgency.map((a: any) => <tr key={a.agency || '-'}><Td mono>{a.agency || '—'}</Td><Td mono>{a.n}</Td><Td mono>{a.with_findings} ({pct(a.with_findings, a.n)}%)</Td></tr>)}
      </Table>
    </div>
  );
}
