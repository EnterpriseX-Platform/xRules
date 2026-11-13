'use client';
import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Table, Td, Tag, fmtTime } from '@/components/pipeline/ui';

export default function DataSetsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter(); const sp = useSearchParams();
  const { data: sets } = useQuery({ queryKey: ['data-sets', projectId], queryFn: () => api.get<any[]>(`/data/datasets?project_id=${projectId}`) });
  useEffect(() => { const s = sp.get('slug'); const hit = s && sets?.find(x => x.slug === s); if (hit) router.replace(`/projects/${projectId}/data-sets/${hit.id}`); }, [sp, sets, projectId, router]);
  return (
    <div className="px-8 py-6">
      <PageHead title="Data Sets" sub="ข้อมูลที่ Data Flow เก็บไว้เป็นรอบ ให้กฎค้นด้วยคีย์" />
      <Table head={['Data Set', 'คีย์', 'แถว', 'รอบที่ใช้อยู่', 'รอบล่าสุด']}
        empty={sets && !sets.length ? <div className="px-4 py-8 text-[14px] text-[#525252]">ยังไม่มี Data Set สร้างได้จากขั้น Write Data Set ใน Data Flow</div> : null}>
        {(sets || []).map(d => (
          <tr key={d.id} className="hover:bg-[#e8e8e8] cursor-pointer" onClick={() => router.push(`/projects/${projectId}/data-sets/${d.id}`)}>
            <Td><span className="font-semibold font-mono text-[13px]">{d.slug}</span></Td>
            <Td mono>{d.keyFields.join(' + ') || '—'}</Td>
            <Td mono>{d.rowCount.toLocaleString()}</Td>
            <Td>{d.active ? <span className="flex items-center gap-2">{fmtTime(d.active.at)}{d.stale && <Tag tone="orange">stale</Tag>}</span> : <Tag>ยังไม่มี</Tag>}</Td>
            <Td>{d.latest ? <span className="flex items-center gap-2">{fmtTime(d.latest.at)}<Tag tone={d.latest.status === 'REJECTED' ? 'red' : d.latest.status === 'ACTIVE' ? 'green' : 'gray'}>{d.latest.status.toLowerCase()}</Tag></span> : '—'}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
