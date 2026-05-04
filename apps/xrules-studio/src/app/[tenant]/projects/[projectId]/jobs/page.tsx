'use client';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Ban } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { EntityTable, Pill } from '@/components/EntityList';
import { api } from '@/lib/api';

export default function JobsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['jobs', projectId],
    queryFn: () => api.get<any[]>(`/jobs?project_id=${projectId}`),
    refetchInterval: 5000,
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/jobs/cancel/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs', projectId] }),
  });

  return (
    <PageContent>
      <PageHeader
        title="Jobs"
        description="Async runs of Integration Flows. Auto-refreshes every 5s."
        stats={[{ label: 'Active', value: rows.filter((j: any) => ['WAITING', 'RUNNING'].includes(j.state)).length }]}
      />
      <EntityTable
        rows={rows}
        isLoading={isLoading}
        emptyText="No jobs yet — Integration Flows create jobs when triggered"
        emptyIcon={Briefcase}
        columns={[
          { header: 'Job', cell: (j: any) => <span className="font-mono text-xs">{j.id.slice(0, 8)}…</span> },
          { header: 'Flow', cell: (j: any) => <span className="text-sm">v{j.flowVersion}</span> },
          { header: 'State', cell: (j: any) => <Pill tone={
            j.state === 'COMPLETED' ? 'ok' :
            j.state === 'ERROR' ? 'danger' :
            j.state === 'CANCELLED' || j.state === 'CANCELLING' ? 'subtle' :
            j.state === 'RUNNING' ? 'info' : 'warn'
          }>{j.state}</Pill> },
          { header: 'Status', cell: (j: any) => <span className="font-mono text-[11px] text-subtle">{j.statusCode || '—'}</span> },
          { header: 'Duration', cell: (j: any) => {
            if (!j.startedAt) return <span className="font-mono text-xs text-subtle">—</span>;
            const end = j.finishedAt ? new Date(j.finishedAt).getTime() : Date.now();
            const start = new Date(j.startedAt).getTime();
            return <span className="font-mono text-xs text-subtle tabular-nums">{Math.round((end - start) / 1000)}s</span>;
          }, align: 'right' },
          {
            header: '', align: 'right',
            cell: (j: any) =>
              ['WAITING', 'RUNNING'].includes(j.state)
                ? <button className="btn-ghost text-danger text-xs" onClick={(e) => { e.stopPropagation(); cancel.mutate(j.id); }}>
                    <Ban className="h-3 w-3" />
                  </button>
                : null,
          },
        ]}
      />
    </PageContent>
  );
}
