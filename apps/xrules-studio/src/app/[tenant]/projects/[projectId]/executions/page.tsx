'use client';
import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { EntityTable, StatusPill } from '@/components/EntityList';
import { executionsApi } from '@/lib/api';

export default function ExecutionsPage() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['executions'],
    queryFn: () => executionsApi.list({ limit: 100 }),
  });

  return (
    <PageContent>
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
          { header: 'Rule', cell: (r: any) => <span className="text-sm">{r.rule?.name || r.ruleId}</span> },
          { header: 'Status', cell: (r: any) => <StatusPill status={r.status} /> },
          { header: 'Duration', cell: (r: any) => <span className="font-mono text-xs text-subtle tabular-nums">{r.duration ?? '—'}ms</span>, align: 'right' },
          { header: 'When', cell: (r: any) => <span className="font-mono text-xs text-subtle">{new Date(r.createdAt).toLocaleString()}</span>, align: 'right' },
        ]}
      />
    </PageContent>
  );
}
