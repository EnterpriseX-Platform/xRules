'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ListTree } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { rulesApi } from '@/lib/api';

export default function DrdPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: rules = [] } = useQuery({
    queryKey: ['rules', projectId],
    queryFn: () => rulesApi.list(projectId),
  });

  return (
    <PageContent>
      <PageHeader
        title="DRD — Decision Requirements Diagram"
        description="Graph view of dependencies between rules (DMN 1.4)"
        stats={[{ label: 'Nodes', value: rules.length }]}
      />
      <div className="card p-12 text-center">
        <ListTree className="h-12 w-12 mx-auto text-subtle/40 mb-3" />
        <div className="text-sm text-subtle">DRD visualization (coming soon)</div>
        <div className="text-xs text-subtle/60 font-mono mt-2">Will render rule.dependsOn graph using ReactFlow</div>
      </div>
    </PageContent>
  );
}
