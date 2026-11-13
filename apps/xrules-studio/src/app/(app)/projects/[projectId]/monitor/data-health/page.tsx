'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Table, Td, Tag, fmtTime } from '@/components/pipeline/ui';

export default function DataHealthPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: h } = useQuery({ queryKey: ['mon-dh', projectId], queryFn: () => api.get<any>(`/platform/monitor/data-health?project_id=${projectId}`), refetchInterval: 30000 });
  if (!h) return <div className="px-8 py-6" />;
  return (
    <div className="px-8 py-6">
      <PageHead title="Data Health" sub="อายุข้อมูลอ้างอิง ผลการดึงรอบล่าสุด และการเชื่อมต่อ" />
      <Table head={['Data Set', 'แถว', 'รอบที่ใช้อยู่', 'อายุ', 'รอบล่าสุด', 'ตัดทิ้ง']}>
        {h.datasets.map((d: any) => <tr key={d.id}><Td mono>{d.slug}</Td><Td mono>{d.rows.toLocaleString()}</Td><Td>{fmtTime(d.activeAt)}</Td>
          <Td>{d.ageHours == null ? '—' : d.ageHours > 36 ? <Tag tone="orange">{d.ageHours} ชม.</Tag> : `${d.ageHours} ชม.`}</Td>
          <Td>{d.lastStatus ? <span className="flex items-center gap-2">{d.lastStatus === 'REJECTED' ? <Tag tone="red">ไม่ผ่านตรวจ</Tag> : <Tag tone="green">ผ่าน</Tag>}{d.stale && <Tag tone="orange">stale</Tag>}<span className="text-[12px] text-[#525252]">{fmtTime(d.lastAt)}</span></span> : '—'}</Td>
          <Td mono>{d.rejectedRows}</Td></tr>)}
      </Table>
      <h2 className="text-[20px] mt-8 mb-3">Connections</h2>
      <Table head={['Connection', 'ชนิด', 'ทดสอบล่าสุด', 'อ่านอย่างเดียว']}>
        {h.connections.map((c: any) => <tr key={c.id}><Td mono>{c.slug}</Td><Td>{c.type}</Td>
          <Td>{c.lastTest ? (c.lastTest.ok ? <Tag tone="green">ต่อได้ · {c.lastTest.ms} ms</Tag> : <Tag tone="red">ต่อไม่ได้</Tag>) : '—'}{c.lastTest && <span className="text-[12px] text-[#525252] ml-2">{fmtTime(c.lastTest.at)}</span>}</Td>
          <Td>{c.lastTest?.readOnly ? (c.lastTest.readOnly.verified ? <Tag tone="green">ยืนยันแล้ว</Tag> : <Tag tone="red">เขียนได้</Tag>) : '—'}</Td></tr>)}
      </Table>
    </div>
  );
}
