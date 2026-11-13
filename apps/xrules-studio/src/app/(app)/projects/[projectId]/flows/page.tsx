'use client';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Workflow, Zap, GitBranch } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { EntityTable, StatusPill, Pill } from '@/components/EntityList';
import { flowsApi } from '@/lib/api';

type Kind = 'DECISION' | 'INTEGRATION' | 'ALL';

const KIND_META: Record<Exclude<Kind, 'ALL'>, {
  title: string;
  description: string;
  emptyText: string;
  emptyBody: string;
  cta: string;
  icon: any;
}> = {
  DECISION: {
    title: 'Decision Flows',
    description: 'Synchronous decision orchestration — chain rules together, branch on outputs, return a composed result.',
    emptyText: 'No decision flows yet',
    emptyBody: 'A decision flow takes input, calls one or more rules in sequence (with branching, mapping, and transforms), and returns the composed output. Sync, fast, no jobs.',
    cta: 'New decision flow',
    icon: Workflow,
  },
  INTEGRATION: {
    title: 'Integration Flows',
    description: 'Asynchronous orchestration that fetches data from external systems before calling rules — HTTP, DB queries, queues, scheduled jobs.',
    emptyText: 'No integration flows yet',
    emptyBody: 'Integration flows fetch data via Connections (HTTP / Postgres / Kafka / S3), transform it, then run rules. Long-running work goes through Jobs.',
    cta: 'New integration flow',
    icon: Zap,
  },
};

export default function FlowsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const kindParam = (sp.get('kind') || '').toUpperCase();
  const kind: Kind = kindParam === 'DECISION' || kindParam === 'INTEGRATION' ? kindParam : 'ALL';
  const meta = kind !== 'ALL' ? KIND_META[kind] : null;

  const [showCreate, setShowCreate] = useState(false);

  const { data: flows = [], isLoading } = useQuery({
    queryKey: ['flows', projectId],
    queryFn: () => flowsApi.list(projectId),
  });

  const filtered = (flows as any[]).filter((f) =>
    kind === 'ALL' ? true : String(f.kind || 'DECISION').toUpperCase() === kind,
  );

  const stats = {
    published: filtered.filter((f: any) => f.status === 'published').length,
    draft:     filtered.filter((f: any) => f.status === 'draft').length,
    total:     filtered.length,
  };

  return (
    <PageContent>
      <PageHeader
        title={meta?.title || 'Flows'}
        description={meta?.description || 'Orchestration — both sync (decision flows) and async (integration flows).'}
        stats={[{ label: 'Published', value: stats.published }, { label: 'Draft', value: stats.draft }, { label: 'Total', value: stats.total }]}
        actions={
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" />
            {meta?.cta || 'New flow'}
          </button>
        }
      />

      {/* Kind toggle when on the unified /flows page */}
      {kind === 'ALL' && (
        <div className="flex items-center gap-2 mb-5">
          <span className="label-section mr-2">Kind</span>
          <KindChip current="ALL"         active                     >All</KindChip>
          <KindChip current="DECISION"    onClick={() => router.push(`?kind=DECISION`)}    icon={Workflow}>Decision Flows</KindChip>
          <KindChip current="INTEGRATION" onClick={() => router.push(`?kind=INTEGRATION`)} icon={Zap}>Integration Flows</KindChip>
        </div>
      )}

      <EntityTable
        rows={filtered}
        isLoading={isLoading}
        emptyText={meta?.emptyText || 'No flows yet'}
        emptyIcon={meta?.icon || Workflow}
        emptyBody={meta?.emptyBody}
        emptyCta={
          <button className="btn-primary text-sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" />
            {meta?.cta || 'Create your first flow'}
          </button>
        }
        hrefFor={(f) => `/projects/${projectId}/flows/${f.id}`}
        columns={[
          {
            header: 'Flow',
            cell: (f: any) => {
              const isInt = String(f.kind || 'DECISION').toUpperCase() === 'INTEGRATION';
              const Icon = isInt ? Zap : Workflow;
              const tone = isInt ? 'text-warn bg-warn/10 border-warn/30' : 'text-accent bg-accent/10 border-accent/30';
              return (
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center border ${tone}`}>
                    <Icon className="h-4 w-4" strokeWidth={1.8} />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{f.name}</div>
                    <div className="text-xs text-subtle">{f.slug}</div>
                  </div>
                </div>
              );
            },
          },
          {
            header: 'Kind',
            cell: (f: any) => {
              const isInt = String(f.kind || 'DECISION').toUpperCase() === 'INTEGRATION';
              return <Pill tone={isInt ? 'warn' : 'info'}>{isInt ? 'integration' : 'decision'}</Pill>;
            },
          },
          { header: 'Status', cell: (f: any) => <StatusPill status={f.status} /> },
          { header: 'Nodes', cell: (f: any) => <span className="text-xs text-subtle tabular-nums">{(f.graph?.nodes?.length ?? 0)}</span>, align: 'right' },
          { header: 'Version', cell: (f: any) => <span className="text-xs text-subtle tabular-nums">v{f.version}</span>, align: 'right' },
        ]}
      />

      {showCreate && (
        <CreateFlowDialog
          projectId={projectId}
          defaultKind={kind === 'ALL' ? 'DECISION' : kind}
          lockKind={kind !== 'ALL'}
          onClose={() => setShowCreate(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['flows', projectId] })}
        />
      )}
    </PageContent>
  );
}

function KindChip({ current, active, onClick, icon: Icon, children }: {
  current: Kind;
  active?: boolean;
  onClick?: () => void;
  icon?: any;
  children: React.ReactNode;
}) {
  const cls = active
    ? 'bg-accent/10 text-accent border-accent/30'
    : 'bg-transparent text-subtle border-border/70 hover:text-text hover:border-border';
  return (
    <button onClick={onClick} className={`pill border inline-flex items-center gap-1.5 px-2.5 py-1 text-[11.5px] ${cls}`}>
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </button>
  );
}

function CreateFlowDialog({
  projectId, defaultKind, lockKind, onClose, onCreated,
}: {
  projectId: string;
  defaultKind: Exclude<Kind, 'ALL'>;
  lockKind: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Exclude<Kind, 'ALL'>>(defaultKind);
  const [error, setError] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => flowsApi.create({
      name,
      projectId,
      kind,
      graph: {
        nodes: [
          { id: 'in',  type: 'input',  position: { x:  60, y: 120 }, data: { label: 'Input',  kind: 'input'  } },
          { id: 'out', type: 'output', position: { x: 460, y: 120 }, data: { label: 'Output', kind: 'output' } },
        ],
        edges: [{ id: 'e1', source: 'in', target: 'out' }],
      },
    }),
    onSuccess: () => { onCreated(); onClose(); },
    onError: (e: any) => setError(e.message),
  });

  const meta = KIND_META[kind];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 z-50" onClick={onClose}>
      <div className="card w-full max-w-md p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-semibold">{meta.cta}</h2>

        {!lockKind && (
          <div className="grid grid-cols-2 gap-2">
            <KindOption
              active={kind === 'DECISION'}
              onClick={() => setKind('DECISION')}
              icon={Workflow}
              label="Rule Flow"
              hint="Sync · chain rules"
            />
            <KindOption
              active={kind === 'INTEGRATION'}
              onClick={() => setKind('INTEGRATION')}
              icon={Zap}
              label="Integration"
              hint="Async · fetch + jobs"
            />
          </div>
        )}

        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
          <div>
            <label className="label-section block mb-1.5">Name</label>
            <input required className="input w-full" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <p className="text-[11px] text-subtle mt-1.5">{meta.description}</p>
          </div>
          {error && <div className="pill pill-danger">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={mut.isPending || !name} className="btn-primary disabled:opacity-50">
              {mut.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function KindOption({ active, onClick, icon: Icon, label, hint }: {
  active: boolean; onClick: () => void; icon: any; label: string; hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border rounded-lg p-3 text-left transition-colors ${active ? 'border-accent bg-accent/5' : 'border-border/70 hover:border-border'}`}
    >
      <Icon className={`h-4 w-4 mb-1.5 ${active ? 'text-accent' : 'text-subtle'}`} />
      <div className="text-sm font-medium">{label}</div>
      <div className="text-[11px] text-subtle">{hint}</div>
    </button>
  );
}
