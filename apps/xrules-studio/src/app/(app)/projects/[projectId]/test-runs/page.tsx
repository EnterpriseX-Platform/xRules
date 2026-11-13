'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Table, Td, Tag, fmtTime } from '@/components/pipeline/ui';

export default function TestRunsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [open, setOpen] = useState<string | null>(null);
  const { data: runs = [] } = useQuery({ queryKey: ['test-runs', projectId], queryFn: () => api.get<any[]>(`/platform/test-runs?project_id=${projectId}`), refetchInterval: 10000 });
  return (
    <div className="px-8 py-6">
      <PageHead title="Test Runs" sub="Test suite runs, manual and nightly at 02:00" />
      <Table head={['Suite', 'Result', 'Passed', 'When']} empty={!runs.length ? <div className="px-4 py-6 text-[14px] text-[#525252]">No runs yet</div> : null}>
        {(runs as any[]).flatMap(r => [
          <tr key={r.id} className="hover:bg-[#e8e8e8] cursor-pointer" onClick={() => setOpen(open === r.id ? null : r.id)}>
            <Td>{r.testSuite?.name}</Td><Td>{r.status === 'SUCCESS' ? <Tag tone="green">All passed</Tag> : r.status === 'FAILED' ? <Tag tone="red">Failed {r.failed}</Tag> : <Tag tone="blue">{r.status.toLowerCase()}</Tag>}</Td>
            <Td mono>{r.passed}/{r.totalRows}</Td><Td>{fmtTime(r.finishedAt || r.createdAt)}</Td>
          </tr>,
          open === r.id ? <tr key={r.id + '-d'}><td colSpan={4} className="bg-[#f4f4f4] px-6 py-3">{(r.coverage?.results || []).map((x: any) => <div key={x.id} className="text-[13px] py-1"><Tag tone={x.pass ? 'green' : 'red'}>{x.pass ? 'Passed' : 'Failed'}</Tag> <b>{x.name}</b> {(x.checks || []).filter((c: any) => !c.ok).map((c: any) => c.message).join(' · ')}</div>)}</td></tr> : null,
        ])}
      </Table>
    </div>
  );
}
