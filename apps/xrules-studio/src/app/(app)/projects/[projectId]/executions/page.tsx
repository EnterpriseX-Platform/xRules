'use client';
import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { EntityTable, StatusPill } from '@/components/EntityList';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { executionsApi, api } from '@/lib/api';
import { Table, Td, Tag, fmtTime } from '@/components/pipeline/ui';

export default function ExecutionsPage() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['executions'],
    queryFn: () => executionsApi.list({ limit: 100 }),
  });

  const { projectId } = useParams<{ projectId: string }>();
  const { data: flowRuns = [] } = useQuery({ queryKey: ['flow-executions', projectId], queryFn: () => api.get<any[]>(`/data/flow-executions?project_id=${projectId}`) });

  return (
    <PageContent>
      {flowRuns.length > 0 && (
        <div className="mb-8">
          <h2 className="text-[20px] mb-3">Decision Flows</h2>
          <Table head={['Flow', 'ผล', 'เวลา', 'ใช้เวลา']}>
            {flowRuns.map((r: any) => (
              <tr key={r.id} className="hover:bg-[#e8e8e8]">
                <Td><Link className="text-[#0f62fe] hover:underline" href={`/projects/${projectId}/executions/${r.id}`}>{r.flow}</Link> <span className="font-mono text-[12px] text-[#525252]">v{r.version}</span></Td>
                <Td><span className="flex gap-1">{r.summary?.error ? <Tag tone="red">ERROR {r.summary.error}</Tag> : <Tag tone="green">ผ่าน</Tag>}{r.summary?.warning ? <Tag tone="orange">WARNING {r.summary.warning}</Tag> : null}{r.summary?.skipped ? <Tag>SKIPPED {r.summary.skipped}</Tag> : null}</span></Td>
                <Td>{fmtTime(r.at)}</Td>
                <Td mono>{r.ms} ms</Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
      <PageHeader
        title="Executions"
        description="Live log of every rule and flow execution"
        stats={[{ label: 'Recent', value: rows.length }]}
      />
      <EntityTable
        rows={rows}
        isLoading={isLoading}
        emptyText="No executions yet"
        emptyIcon={Activity}
        columns={[
          { header: 'Rule', cell: (r: any) => (
              <div>
                <div className="text-sm font-medium">{r.ruleName || r.rule?.name || 'unnamed'}</div>
                <div className="text-[10px] text-subtle font-mono">{(r.ruleType || '').replace('_', ' ')}</div>
              </div>
            ),
          },
          { header: 'Status', cell: (r: any) => <StatusPill status={r.status} /> },
          { header: 'Duration', cell: (r: any) => <span className="font-mono text-xs text-subtle tabular-nums">{r.duration ?? '—'}ms</span>, align: 'right' },
          { header: 'When', cell: (r: any) => <span className="font-mono text-xs text-subtle">{new Date(r.createdAt).toLocaleString()}</span>, align: 'right' },
        ]}
      />
    </PageContent>
  );
}
