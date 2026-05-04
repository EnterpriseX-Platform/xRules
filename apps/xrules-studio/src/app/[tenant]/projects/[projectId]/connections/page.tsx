'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plug, Plus } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { EntityTable, Pill } from '@/components/EntityList';
import { connectionsApi } from '@/lib/api';

export default function ConnectionsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['connections', projectId],
    queryFn: () => connectionsApi.list(projectId),
  });

  return (
    <PageContent>
      <PageHeader
        title="Connections"
        description="Encrypted credentials referenced by Flow nodes (HTTP, DB, Kafka, S3)"
        stats={[{ label: 'Total', value: rows.length }]}
        actions={<button className="btn-primary"><Plus className="h-3.5 w-3.5" />New Connection</button>}
      />
      <EntityTable
        rows={rows}
        isLoading={isLoading}
        emptyText="No connections yet"
        emptyIcon={Plug}
        columns={[
          { header: 'Connection', cell: (c: any) => <div><div className="text-sm font-medium">{c.name}</div><div className="text-xs text-subtle font-mono">{c.slug}</div></div> },
          { header: 'Type', cell: (c: any) => <Pill tone="info">{c.type.toUpperCase()}</Pill> },
          { header: 'Host', cell: (c: any) => <span className="font-mono text-xs text-subtle">{c.meta?.host || c.meta?.url || '—'}</span> },
        ]}
      />
    </PageContent>
  );
}
