'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Database, Plus } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { EntityTable, Pill } from '@/components/EntityList';
import { datasetsApi } from '@/lib/api';

export default function DatasetsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['datasets', projectId],
    queryFn: () => datasetsApi.list(projectId),
  });

  return (
    <PageContent>
      <PageHeader
        title="Datasets"
        description="Sample data (CSV/JSONL) for batch testing and replay simulations"
        stats={[{ label: 'Total', value: rows.length }]}
        actions={<button className="btn-primary"><Plus className="h-3.5 w-3.5" />Upload Dataset</button>}
      />
      <EntityTable
        rows={rows}
        isLoading={isLoading}
        emptyText="No datasets yet"
        emptyIcon={Database}
        columns={[
          { header: 'Dataset', cell: (d: any) => <div><div className="text-sm font-medium">{d.name}</div><div className="text-xs text-subtle font-mono">{d.slug}</div></div> },
          { header: 'Format', cell: (d: any) => <Pill tone="subtle">{d.format}</Pill> },
          { header: 'Rows', cell: (d: any) => <span className="font-mono text-xs text-subtle tabular-nums">{d.rowCount}</span>, align: 'right' },
        ]}
      />
    </PageContent>
  );
}
