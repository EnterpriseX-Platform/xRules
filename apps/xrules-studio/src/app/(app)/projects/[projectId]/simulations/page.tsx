'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { TestNav } from '@/components/layout/TestNav';
import { EntityTable, StatusPill, Pill } from '@/components/EntityList';
import { simulationsApi } from '@/lib/api';

export default function SimulationsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: sims = [], isLoading } = useQuery({
    queryKey: ['simulations', projectId],
    queryFn: () => simulationsApi.list(projectId),
  });

  return (
    <PageContent>
      <PageHeader
        title="Test"
        description="Validate rules before they ship — assertion suites, sample data, version diff and replay, and latency benchmarks"
        stats={[{ label: 'Simulations', value: sims.length }]}
      />
      <TestNav />

      <EntityTable
        rows={sims}
        isLoading={isLoading}
        emptyText="No simulations yet — run one from a rule's Simulate tab"
        emptyIcon={Sparkles}
        columns={[
          {
            header: 'Simulation',
            cell: (s: any) => (
              <div>
                <div className="text-sm font-medium">{s.name}</div>
                <div className="text-xs text-subtle font-mono">{new Date(s.createdAt).toLocaleString()}</div>
              </div>
            ),
          },
          { header: 'Kind', cell: (s: any) => <Pill tone="info">{s.kind}</Pill> },
          { header: 'Status', cell: (s: any) => <StatusPill status={s.status} /> },
          {
            header: 'Result',
            cell: (s: any) => (
              <span className="font-mono text-[11px] text-subtle truncate max-w-[200px] inline-block">
                {s.result?.diverged !== undefined ? `${s.result.diverged}/${s.result.total} diverged` : s.result?.points?.length ? `${s.result.points.length} points` : '—'}
              </span>
            ),
            align: 'right',
          },
        ]}
      />
    </PageContent>
  );
}
