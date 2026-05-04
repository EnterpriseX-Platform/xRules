'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { FlaskConical, Plus } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { EntityTable, Pill } from '@/components/EntityList';
import { testSuitesApi } from '@/lib/api';

export default function TestSuitesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: suites = [], isLoading } = useQuery({
    queryKey: ['test-suites', projectId],
    queryFn: () => testSuitesApi.list(projectId),
  });

  return (
    <PageContent>
      <PageHeader
        title="Test Suites"
        description="Batch testing — run rules against datasets, get coverage report"
        stats={[{ label: 'Total', value: suites.length }]}
        actions={<button className="btn-primary"><Plus className="h-3.5 w-3.5" />New Suite</button>}
      />

      <EntityTable
        rows={suites}
        isLoading={isLoading}
        emptyText="No test suites yet"
        emptyIcon={FlaskConical}
        columns={[
          {
            header: 'Suite',
            cell: (s: any) => (
              <div>
                <div className="text-sm font-medium">{s.name}</div>
                <div className="text-xs text-subtle font-mono">{s.slug}</div>
              </div>
            ),
          },
          { header: 'Rules', cell: (s: any) => <Pill tone="info">{s.rules?.length ?? 0} rules</Pill> },
          { header: 'Last Run', cell: () => <span className="text-xs text-subtle font-mono">—</span> },
        ]}
      />
    </PageContent>
  );
}
