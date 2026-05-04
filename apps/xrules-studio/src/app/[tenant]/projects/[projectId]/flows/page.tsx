'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Workflow } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { EntityTable, StatusPill, Pill } from '@/components/EntityList';
import { flowsApi } from '@/lib/api';

export default function FlowsPage() {
  const { tenant, projectId } = useParams<{ tenant: string; projectId: string }>();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: flows = [], isLoading } = useQuery({
    queryKey: ['flows', projectId],
    queryFn: () => flowsApi.list(projectId),
  });

  const stats = {
    published: flows.filter((f: any) => f.status === 'published').length,
    draft:     flows.filter((f: any) => f.status === 'draft').length,
    total:     flows.length,
  };

  return (
    <PageContent>
      <PageHeader
        title="Flows"
        description="Orchestration: fetch data → transform → call rules → output"
        stats={[{ label: 'Published', value: stats.published }, { label: 'Draft', value: stats.draft }, { label: 'Total', value: stats.total }]}
        actions={<button className="btn-primary" onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5" />New Flow</button>}
      />

      <EntityTable
        rows={flows}
        isLoading={isLoading}
        emptyText="No flows — create one to orchestrate rules + integrations"
        emptyIcon={Workflow}
        hrefFor={(f) => `/${tenant}/projects/${projectId}/flows/${f.id}`}
        columns={[
          {
            header: 'Flow',
            cell: (f: any) => (
              <div>
                <div className="text-sm font-medium">{f.name}</div>
                <div className="text-xs text-subtle font-mono">{f.slug}</div>
              </div>
            ),
          },
          { header: 'Status', cell: (f: any) => <StatusPill status={f.status} /> },
          { header: 'Nodes', cell: (f: any) => <Pill tone="subtle">{(f.graph?.nodes?.length ?? 0)} nodes</Pill>, align: 'right' },
          { header: 'Version', cell: (f: any) => <span className="font-mono text-xs text-subtle tabular-nums">v{f.version}</span>, align: 'right' },
        ]}
      />

      {showCreate && <CreateFlowDialog projectId={projectId} onClose={() => setShowCreate(false)} onCreated={() => qc.invalidateQueries({ queryKey: ['flows', projectId] })} />}
    </PageContent>
  );
}

function CreateFlowDialog({ projectId, onClose, onCreated }: { projectId: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => flowsApi.create({ name, projectId, graph: { nodes: [{ id: 'in', type: 'input', position: { x: 0, y: 0 }, data: {} }, { id: 'out', type: 'output', position: { x: 400, y: 0 }, data: {} }], edges: [] } }),
    onSuccess: () => { onCreated(); onClose(); },
    onError: (e: any) => setError(e.message),
  });
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 z-50" onClick={onClose}>
      <div className="card w-full max-w-md p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold">New Flow</h2>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
          <div>
            <label className="label-section block mb-1.5">Name</label>
            <input required className="input w-full" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          {error && <div className="pill pill-danger">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={mut.isPending} className="btn-primary disabled:opacity-50">{mut.isPending ? 'Creating…' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
