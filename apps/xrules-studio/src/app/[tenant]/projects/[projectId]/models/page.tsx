'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Brain, Plus } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { EntityTable, StatusPill, Pill } from '@/components/EntityList';
import { api } from '@/lib/api';

export default function ModelsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['models', projectId],
    queryFn: () => api.get<any[]>(`/models?project_id=${projectId}`),
  });

  return (
    <PageContent>
      <PageHeader
        title="Models"
        description="Uploaded artifacts: PMML files, ML pickle, prompt templates"
        stats={[{ label: 'Total', value: rows.length }]}
        actions={<button className="btn-primary"><Plus className="h-3.5 w-3.5" />Upload Model</button>}
      />
      <EntityTable
        rows={rows}
        isLoading={isLoading}
        emptyText="No models yet"
        emptyIcon={Brain}
        columns={[
          { header: 'Model', cell: (m: any) => <div><div className="text-sm font-medium">{m.name}</div><div className="text-xs text-subtle font-mono">{m.slug}</div></div> },
          { header: 'Type', cell: (m: any) => <Pill tone="warn">{m.type.toUpperCase()}</Pill> },
          { header: 'Status', cell: (m: any) => <StatusPill status={m.status} /> },
          { header: 'Version', cell: (m: any) => <span className="font-mono text-xs text-subtle tabular-nums">{m.version}</span>, align: 'right' },
        ]}
      />
    </PageContent>
  );
}
