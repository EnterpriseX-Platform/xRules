'use client';
// DRD — Decision Requirements Diagram (DMN 1.4) — full project graph.
// Nodes: rules + flows. Edges: explicit RuleDependency rows + flow→rule references.
// Layout: simple topological-ish columns from upstream to downstream.
import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ListTree, Workflow, ExternalLink } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import 'reactflow/dist/style.css';
import { ReactFlowProvider, Background, Controls, MarkerType, type Edge, type Node } from 'reactflow';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { api } from '@/lib/api';

const ReactFlow = dynamic(() => import('reactflow').then((m) => m.default), { ssr: false });

const TYPE_COLOR: Record<string, string> = {
  DECISION_TABLE: 'rgb(var(--c-info))',
  DECISION_TREE:  'rgb(var(--c-mint))',
  FORMULA:        'rgb(var(--c-warn))',
  SCRIPT:         'rgb(var(--c-text))',
  LOOKUP:         'rgb(var(--c-text))',
  AI_AGENT:       'rgb(var(--c-accent))',
  MODEL_CALL:     'rgb(var(--c-danger))',
  SCORECARD:      'rgb(var(--c-accent))',
  FLOW:           'rgb(var(--c-mint))',
};

interface DrdNode {
  id: string; name: string; slug: string; alias?: string | null; type: string; status?: string; version?: number; isFlow: boolean;
}
interface DrdEdge { fromId: string; toId: string; kind: string }

export default function DrdPage() {
  const { tenant, projectId } = useParams<{ tenant: string; projectId: string }>();

  const { data, isLoading } = useQuery<{ nodes: DrdNode[]; edges: DrdEdge[] }>({
    queryKey: ['drd', projectId],
    queryFn: () => api.get(`/tools/drd/${projectId}`),
  });

  const { rfNodes, rfEdges } = useMemo(() => {
    if (!data) return { rfNodes: [] as Node[], rfEdges: [] as Edge[] };
    return layoutDrd(data.nodes, data.edges, tenant, projectId);
  }, [data, tenant, projectId]);

  const ruleCount = data?.nodes.filter(n => !n.isFlow).length || 0;
  const flowCount = data?.nodes.filter(n => n.isFlow).length || 0;
  const edgeCount = data?.edges.length || 0;

  return (
    <PageContent>
      <PageHeader
        title="DRD — Decision Requirements Diagram"
        description="Graph view of dependencies between rules and flows (DMN 1.4)"
        stats={[
          { label: 'Rules', value: ruleCount },
          { label: 'Flows', value: flowCount },
          { label: 'Edges', value: edgeCount },
        ]}
      />
      <div className="card overflow-hidden h-[calc(100vh-220px)] min-h-[500px]">
        {isLoading && <div className="p-12 text-center text-subtle text-xs font-mono">Loading graph…</div>}
        {!isLoading && !data?.nodes.length && (
          <div className="p-12 text-center">
            <ListTree className="h-12 w-12 mx-auto text-subtle/40 mb-3" />
            <div className="text-sm text-subtle">No rules or flows yet — create some to see the DRD.</div>
          </div>
        )}
        {!isLoading && (data?.nodes.length || 0) > 0 && (
          <ReactFlowProvider>
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              fitView
              minZoom={0.3}
              maxZoom={1.5}
              proOptions={{ hideAttribution: true }}
              nodesDraggable
              nodesConnectable={false}
            >
              <Background gap={16} size={1} />
              <Controls position="bottom-left" />
            </ReactFlow>
          </ReactFlowProvider>
        )}
      </div>
    </PageContent>
  );
}

// Topological layering — nodes with no incoming edges go in column 0,
// then their children in column 1, etc. Within a column, sort by name.
function layoutDrd(nodes: DrdNode[], edges: DrdEdge[], tenant: string, projectId: string): { rfNodes: Node[]; rfEdges: Edge[] } {
  const incoming = new Map<string, number>();
  const childrenOf = new Map<string, string[]>();
  for (const n of nodes) { incoming.set(n.id, 0); childrenOf.set(n.id, []); }
  for (const e of edges) {
    incoming.set(e.toId, (incoming.get(e.toId) || 0) + 1);
    childrenOf.set(e.fromId, [...(childrenOf.get(e.fromId) || []), e.toId]);
  }

  // Kahn-style BFS column assignment
  const column = new Map<string, number>();
  const queue: string[] = [];
  Array.from(incoming.entries()).forEach(([id, n]) => { if (n === 0) { column.set(id, 0); queue.push(id); } });
  while (queue.length) {
    const id = queue.shift()!;
    const c = column.get(id)!;
    for (const child of childrenOf.get(id) || []) {
      const next = (column.get(child) ?? -1) < c + 1 ? c + 1 : column.get(child)!;
      column.set(child, next);
      queue.push(child);
    }
  }
  // Anything not reached (cycle) → column 0
  for (const n of nodes) if (!column.has(n.id)) column.set(n.id, 0);

  // Group by column
  const byCol = new Map<number, DrdNode[]>();
  for (const n of nodes) {
    const c = column.get(n.id)!;
    const arr = byCol.get(c) || [];
    arr.push(n);
    byCol.set(c, arr);
  }
  Array.from(byCol.values()).forEach((arr: DrdNode[]) => arr.sort((a, b) => a.name.localeCompare(b.name)));

  const COL_WIDTH = 240;
  const ROW_HEIGHT = 92;

  const rfNodes: Node[] = [];
  Array.from(byCol.entries()).forEach(([c, list]: [number, DrdNode[]]) => {
    list.forEach((n: DrdNode, i: number) => {
      const color = TYPE_COLOR[n.type] || 'rgb(var(--c-subtle))';
      const href = n.isFlow
        ? `/${tenant}/projects/${projectId}/flows/${n.id.replace(/^flow:/, '')}`
        : `/${tenant}/projects/${projectId}/rules/${n.id}`;
      rfNodes.push({
        id: n.id,
        type: 'default',
        position: { x: c * COL_WIDTH, y: i * ROW_HEIGHT },
        data: {
          label: (
            <div className="text-left p-1">
              <div className="flex items-center gap-1.5 mb-0.5">
                {n.isFlow ? <Workflow className="h-2.5 w-2.5" style={{ color }} /> : <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
                <span className="font-mono text-[9px] text-subtle uppercase tracking-tight">{n.type}</span>
              </div>
              <div className="text-[11px] font-medium leading-tight truncate">{n.name}</div>
              <div className="font-mono text-[8px] text-subtle truncate">{n.slug}</div>
            </div>
          ),
        } as any,
        style: {
          width: 200,
          padding: 4,
          borderRadius: 6,
          background: 'rgb(var(--c-surface))',
          borderColor: color,
          borderWidth: 1.5,
          color: 'rgb(var(--c-text))',
        },
      });
    });
  });

  const rfEdges: Edge[] = edges.map((e, i) => ({
    id: `e${i}`,
    source: e.fromId, target: e.toId,
    label: e.kind === 'flow_call' ? '' : e.kind,
    labelStyle: { fontSize: 9, fontFamily: 'monospace' },
    style: { stroke: e.kind === 'flow_call' ? 'rgb(var(--c-mint))' : 'rgb(var(--c-subtle))', strokeWidth: 1.2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: 'rgb(var(--c-subtle))' },
    animated: e.kind === 'flow_call',
  }));

  return { rfNodes, rfEdges };
}
