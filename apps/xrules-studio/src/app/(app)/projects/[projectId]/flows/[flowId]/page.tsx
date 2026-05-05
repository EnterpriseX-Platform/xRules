'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import {
  Background, BackgroundVariant, Controls, MiniMap,
  addEdge, applyEdgeChanges, applyNodeChanges,
  type Connection, type Edge, type Node,
  type NodeChange, type EdgeChange, ReactFlowProvider, useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Save, Rocket, Trash2 } from 'lucide-react';
import { StatusPill, Pill } from '@/components/ui/Pill';
import { NodeConfig } from '@/components/flow/NodeConfig';
import { nodeTypes, PALETTE_GROUPS, NODE_ICONS, nodeLabel, type NodeKind } from '@/components/flow/nodeTypes';
import { flowsApi, api } from '@/lib/api';
import { cn } from '@/lib/cn';

// ReactFlow needs to be client-side only
const ReactFlow = dynamic(() => import('reactflow').then((m) => m.default), { ssr: false });

export default function FlowDetailPage() {
  return (
    <ReactFlowProvider>
      <FlowDetailInner />
    </ReactFlowProvider>
  );
}

function FlowDetailInner() {
  const { projectId, flowId } = useParams<{ projectId: string; flowId: string }>();
  const qc = useQueryClient();

  const { data: flow, isLoading } = useQuery({
    queryKey: ['flow', flowId],
    queryFn: () => flowsApi.get(flowId),
  });

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const rf = useReactFlow();

  // Load graph from server data
  useEffect(() => {
    if (flow?.graph) {
      setNodes(flow.graph.nodes || []);
      setEdges(flow.graph.edges || []);
      setDirty(false);
    }
  }, [flow]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
    if (changes.some((c) => c.type !== 'select')) setDirty(true);
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
    if (changes.some((c) => c.type !== 'select')) setDirty(true);
  }, []);

  const onConnect = useCallback((c: Connection) => {
    setEdges((eds) => addEdge({ ...c, animated: true }, eds));
    setDirty(true);
  }, []);

  const updateNode = useCallback((id: string, data: any) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data } : n)));
    setDirty(true);
  }, []);

  const removeNode = useCallback((id: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    setSelectedId((s) => (s === id ? null : s));
    setDirty(true);
  }, []);

  const addNodeOfKind = useCallback((kind: NodeKind) => {
    const id = `${kind}-${Date.now().toString(36)}`;
    const center = rf.getViewport();
    const node: Node = {
      id,
      type: kind,
      position: { x: 200 - center.x, y: 200 - center.y },
      data: { label: nodeLabel(kind) },
    };
    setNodes((nds) => [...nds, node]);
    setDirty(true);
    setSelectedId(id);
  }, [rf]);

  const save = useMutation({
    mutationFn: () => flowsApi.update(flowId, { graph: { nodes, edges } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flow', flowId] });
      setDirty(false);
    },
  });

  const publish = useMutation({
    mutationFn: () => api.post(`/flows/${flowId}/publish`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flow', flowId] }),
  });

  const selected = useMemo(() => nodes.find((n) => n.id === selectedId) || null, [nodes, selectedId]);

  if (isLoading || !flow) {
    return <div className="p-8 text-subtle font-mono">Loading flow…</div>;
  }

  return (
    <div className="h-[calc(100vh-60px)] flex flex-col">
      {/* Compact header */}
      <div className="px-6 py-3 border-b border-border bg-bg flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <Link href={`/projects/${projectId}/flows`} className="text-xs text-subtle font-mono hover:text-text">FLOWS</Link>
            <span className="text-subtle/50">/</span>
            <span className="font-mono text-xs text-subtle">{flow.slug}</span>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold truncate">{flow.name}</h1>
            <StatusPill status={flow.status} />
            <Pill tone="info">v{flow.version}</Pill>
            <Pill tone="subtle">{nodes.length} nodes · {edges.length} edges</Pill>
            {dirty && <Pill tone="warn">unsaved</Pill>}
          </div>
        </div>
        <button className="btn-outline" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
          <Save className="h-3.5 w-3.5" />
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        <button className="btn-primary" onClick={() => publish.mutate()} disabled={publish.isPending}>
          <Rocket className="h-3.5 w-3.5" />
          {publish.isPending ? 'Publishing…' : 'Publish'}
        </button>
      </div>

      {/* Designer */}
      <div className="flex-1 grid grid-cols-[200px_1fr_320px] min-h-0">
        {/* Palette */}
        <div className="border-r border-border bg-sidebar overflow-y-auto">
          <div className="px-4 py-3 label-section">Node Palette</div>
          <div className="px-3 space-y-3">
            {PALETTE_GROUPS.map((group) => (
              <div key={group.group}>
                <div className="label-section text-[9px] mb-1.5">{group.group}</div>
                <div className="space-y-1">
                  {group.items.map((p) => {
                    const Icon = NODE_ICONS[p.kind];
                    return (
                      <button
                        key={p.kind}
                        onClick={() => addNodeOfKind(p.kind)}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded border border-border hover:border-accent/50 hover:bg-muted/50 transition-colors text-left text-xs"
                        title={`Add ${p.label} node`}
                      >
                        <Icon className={cn('h-3 w-3', toneText(p.tone))} />
                        <span>{p.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 mt-6 label-section">Tips</div>
          <ul className="px-4 mt-2 space-y-1 text-[11px] font-mono text-subtle list-disc list-inside">
            <li>Click palette to add a node</li>
            <li>Drag handle → handle to connect</li>
            <li>Backspace to delete selected</li>
            <li>Save before publish</li>
          </ul>
        </div>

        {/* Canvas */}
        <div className="bg-bg relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            nodeTypes={nodeTypes as any}
            fitView
            defaultEdgeOptions={{ animated: true, style: { stroke: 'rgb(var(--c-accent))', strokeWidth: 1.5 } }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgb(var(--c-dot))" />
            <Controls className="!bg-surface !border !border-border !rounded" showInteractive={false} />
            <MiniMap className="!bg-surface !border !border-border !rounded" nodeColor="rgb(var(--c-accent))" maskColor="rgba(0,0,0,0.1)" />
          </ReactFlow>

          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center text-subtle">
                <div className="text-sm font-mono uppercase tracking-label mb-1">Empty flow</div>
                <div className="text-xs">Add nodes from the left palette to start building</div>
              </div>
            </div>
          )}
        </div>

        {/* Inspector */}
        <div className="border-l border-border bg-sidebar overflow-y-auto">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="label-section">Inspector</span>
            {selected && (
              <button className="btn-ghost text-xs text-danger" onClick={() => removeNode(selected.id)}>
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
          <NodeConfig
            node={selected}
            projectId={projectId}
            onChange={updateNode}
            onDelete={removeNode}
          />
        </div>
      </div>
    </div>
  );
}

function toneText(tone: string): string {
  if (tone === 'mint')   return 'text-mint';
  if (tone === 'info')   return 'text-info';
  if (tone === 'warn')   return 'text-warn';
  if (tone === 'accent') return 'text-accent';
  if (tone === 'danger') return 'text-danger';
  return 'text-text';
}
