'use client';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ScrollText, Plus } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { EntityTable, StatusPill, Pill } from '@/components/EntityList';
import { releasesApi } from '@/lib/api';

export default function ReleasesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['releases', projectId],
    queryFn: () => releasesApi.list(projectId),
  });

  const create = useMutation({
    mutationFn: () => releasesApi.create({ projectId, name: new Date().toISOString().slice(0, 10) + '.' + Math.floor(Math.random() * 100) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['releases', projectId] }),
  });

  return (
    <PageContent>
      <PageHeader
        title="Releases"
        description="Immutable snapshots of all rules + flows + models — bind to environments"
        stats={[{ label: 'Total', value: rows.length }]}
        actions={
          <button className="btn-primary" onClick={() => create.mutate()} disabled={create.isPending}>
            <Plus className="h-3.5 w-3.5" />
            {create.isPending ? 'Snapshotting…' : 'New Release'}
          </button>
        }
      />
      <EntityTable
        rows={rows}
        isLoading={isLoading}
        emptyText="No releases yet"
        emptyIcon={ScrollText}
        emptyBody="A release pins {ruleId, version}[] (and flows + models). Pin one to an environment to deploy. Releases are immutable — perfect for rollback."
        columns={[
          { header: 'Release', cell: (r: any) => <div><div className="text-sm font-medium">{r.name}</div><div className="text-xs text-subtle font-mono">{new Date(r.createdAt).toLocaleString()}</div></div> },
          { header: 'Status', cell: (r: any) => <StatusPill status={r.status} /> },
          { header: 'Rules', cell: (r: any) => <Pill tone="info">{r.manifest?.rules?.length ?? 0}</Pill> },
          { header: 'Flows', cell: (r: any) => <Pill tone="mint">{r.manifest?.flows?.length ?? 0}</Pill> },
          { header: 'Models', cell: (r: any) => <Pill tone="warn">{r.manifest?.models?.length ?? 0}</Pill> },
        ]}
      />
    </PageContent>
  );
}
