'use client';
import { Modal, Input } from '@/components/pipeline/ui';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Workflow, Zap, GitBranch } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { EntityTable, StatusPill, Pill } from '@/components/EntityList';
import { flowsApi, api } from '@/lib/api';
import { Select } from '@/components/ui/Select';
import { FolderPanel, flatten, subtreeIds, DRAG_TYPE } from '@/components/rule/FolderPanel';
import { usePerms } from '@/lib/perms';

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
  const perms = usePerms();
  const { projectId } = useParams<{ projectId: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const kindParam = (sp.get('kind') || '').toUpperCase();
  const kind: Kind = kindParam === 'DECISION' || kindParam === 'INTEGRATION' ? kindParam : 'ALL';
  const meta = kind !== 'ALL' ? KIND_META[kind] : null;

  const [showCreate, setShowCreate] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(null);
  const { data: folders = [] } = useQuery({
    queryKey: ['folders', projectId],
    queryFn: () => api.get<any[]>(`/folders?project_id=${projectId}`),
  });
  const folderList = flatten(folders);
  const inFolder = folderId ? subtreeIds(folders, folderId) : new Set<string>();
  const moveTo = async (flowId: string, to: string) => {
    await api.post('/folders/move-item', { kind: 'flow', itemId: flowId, folderId: to || null });
    qc.invalidateQueries({ queryKey: ['flows', projectId] }); qc.invalidateQueries({ queryKey: ['folders', projectId] });
  };

  const { data: flows = [], isLoading } = useQuery({
    queryKey: ['flows', projectId],
    queryFn: () => flowsApi.list(projectId),
  });

  const ofKind = (flows as any[]).filter((f) =>
    kind === 'ALL' ? true : String(f.kind || 'DECISION').toUpperCase() === kind,
  );
  const filtered = ofKind.filter(f => folderId === null || (!!f.folderId && inFolder.has(f.folderId)));

  const stats = {
    published: filtered.filter((f: any) => f.status === 'published').length,
    draft:     filtered.filter((f: any) => f.status === 'draft').length,
    total:     filtered.length,
  };

  return (
    <PageContent>
      <PageHeader
        title={meta?.title || 'Flows'}
        stats={[{ label: 'Published', value: stats.published }, { label: 'Draft', value: stats.draft }, { label: 'Total', value: stats.total }]}
        actions={
          perms.write ? (<button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" />
            {meta?.cta || 'New flow'}
          </button>) : undefined
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

      <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr] gap-3">
      <FolderPanel projectId={projectId} folders={folders} items={ofKind} kind="flow" folderId={folderId} setFolderId={setFolderId} canWrite={!!perms.write} />
      <EntityTable
        rowProps={(f: any) => perms.write ? {
          draggable: true,
          onDragStart: (e: React.DragEvent<HTMLTableRowElement>) => { e.dataTransfer.setData(DRAG_TYPE, f.id); e.dataTransfer.effectAllowed = 'move'; },
        } : {}}
        rows={filtered}
        isLoading={isLoading}
        emptyText={meta?.emptyText || 'No flows yet'}
        emptyIcon={meta?.icon || Workflow}
        emptyCta={
          perms.write ? (<button className="btn-primary text-sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" />
            {meta?.cta || 'Create your first flow'}
          </button>) : undefined
        }
        hrefFor={(f) => `/p/${projectId}/flows/${f.id}`}
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
                  </div>
                </div>
              );
            },
          },
          {
            header: 'Folder',
            cell: (f: any) => perms.write
              ? <span onClick={e => e.stopPropagation()}>
                  <Select aria-label={`Folder of ${f.name}`} value={f.folderId || ''} onChange={e => moveTo(f.id, e.target.value)} className="h-8 text-xs w-44">
                    <option value="">—</option>
                    {folderList.map(x => <option key={x.id} value={x.id}>{x.path}</option>)}
                  </Select>
                </span>
              : <span className="text-xs text-subtle">{folderList.find(x => x.id === f.folderId)?.path || '—'}</span>,
          },
          { header: 'Status', cell: (f: any) => <StatusPill status={f.status} /> },
          { header: 'Nodes', cell: (f: any) => <span className="text-xs text-subtle tabular-nums">{(f.graph?.nodes?.length ?? 0)}</span>, align: 'right' },
          { header: 'Version', cell: (f: any) => <span className="text-xs text-subtle tabular-nums">v{f.version}</span>, align: 'right' },
        ]}
      />
      </div>

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
    ? 'border-[#0f62fe] text-[#161616] font-semibold'
    : 'border-transparent text-[#525252] hover:text-[#161616]';
  return (
    <button onClick={onClick} className={`h-10 px-3 border-b-2 inline-flex items-center gap-1.5 text-[14px] ${cls}`}>
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
  const router = useRouter();
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
    onSuccess: (f: any) => { onCreated(); onClose(); if (f?.id) router.push(`/p/${projectId}/flows/${f.id}`); },
    onError: (e: any) => setError(e.message),
  });

  const meta = KIND_META[kind];

  return (
    <Modal title={meta.cta} onClose={onClose} onSubmit={() => mut.mutate()} submitLabel="Create" submitDisabled={mut.isPending || !name.trim()} error={error}>
      {!lockKind && (
        <div className="grid grid-cols-2 gap-2">
          <KindOption active={kind === 'DECISION'} onClick={() => setKind('DECISION')} icon={Workflow} label="Rule Flow" hint="Sync · chain rules" />
          <KindOption active={kind === 'INTEGRATION'} onClick={() => setKind('INTEGRATION')} icon={Zap} label="Integration" hint="Async · fetch + jobs" />
        </div>
      )}
      <Input id="flow-name" label="Name" value={name} onChange={setName} />
    </Modal>
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
