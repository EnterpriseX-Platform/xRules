'use client';
// Read-mostly visual designer for RULE_FLOW rules.
// Shows the graph in ReactFlow + a JSON editor below for power-user edits.
// The full node-palette editor lives at /flows/[flowId] for INTEGRATION
// flows; for in-rule orchestration this lighter view is plenty.
import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import 'reactflow/dist/style.css';
import {
  ReactFlowProvider, Background, Controls, MarkerType,
  type Node, type Edge,
} from 'reactflow';
import { Workflow, Save } from 'lucide-react';

const ReactFlow = dynamic(() => import('reactflow').then((m) => m.default), { ssr: false });
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

interface RuleFlowDef {
  graph?: { nodes: any[]; edges: any[] };
  nodes?: any[];
  edges?: any[];
}

const KIND_TONE: Record<string, string> = {
  input:    'rgb(var(--c-mint))',
  output:   'rgb(var(--c-mint))',
  rulecall: 'rgb(var(--c-accent))',
  ruleCall: 'rgb(var(--c-accent))',
  assign:   'rgb(var(--c-warn))',
  transform:'rgb(var(--c-warn))',
  branch:   'rgb(var(--c-danger))',
  http:     'rgb(var(--c-info))',
};

export function RuleFlowDesigner({
  definition, onChange,
}: {
  definition: any;
  onChange: (next: RuleFlowDef) => void;
}) {
  const initialGraph = (definition?.graph || definition || { nodes: [], edges: [] }) as { nodes: any[]; edges: any[] };
  const [json, setJson] = useState(() => JSON.stringify(definition || { graph: initialGraph }, null, 2));
  const [error, setError] = useState<string | null>(null);

  const { rfNodes, rfEdges } = useMemo(() => {
    const nodes = initialGraph.nodes || [];
    const edges = initialGraph.edges || [];
    const n: Node[] = nodes.map((node: any) => {
      const kind = String(node.type || node.data?.kind || 'default').toLowerCase();
      const color = KIND_TONE[kind] || 'rgb(var(--c-subtle))';
      const label = node.data?.label || kind;
      const subtitle = node.data?.ruleSlug || node.data?.target || node.data?.condition || '';
      return {
        id: node.id,
        type: 'default',
        position: node.position || { x: 0, y: 0 },
        data: {
          label: (
            <div className="text-left p-1">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="font-mono text-[9px] text-subtle uppercase tracking-tight">{kind}</span>
              </div>
              <div className="text-[12px] font-medium leading-tight truncate">{label}</div>
              {subtitle && <div className="font-mono text-[9px] text-subtle truncate">{subtitle}</div>}
            </div>
          ),
        } as any,
        style: {
          width: 180,
          padding: 4,
          borderRadius: 8,
          background: 'rgb(var(--c-surface))',
          borderColor: color,
          borderWidth: 1.5,
          color: 'rgb(var(--c-text))',
        },
      };
    });
    const e: Edge[] = edges.map((edge: any, i: number) => ({
      id: edge.id || `e${i}`,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      label: edge.label,
      labelStyle: { fontSize: 10 },
      style: { stroke: 'rgb(var(--c-subtle))', strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'rgb(var(--c-subtle))' },
      animated: true,
    }));
    return { rfNodes: n, rfEdges: e };
  }, [initialGraph]);

  function save() {
    try {
      const parsed = JSON.parse(json);
      onChange(parsed);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="space-y-3">
      <div className="card overflow-hidden h-[420px]">
        <div className="px-4 py-2.5 border-b border-border/60 flex items-center gap-2">
          <Workflow className="h-3.5 w-3.5 text-accent" />
          <span className="label-section">Graph preview</span>
          <span className="text-[11px] text-subtle ml-2">
            {(initialGraph.nodes || []).length} nodes · {(initialGraph.edges || []).length} edges
          </span>
        </div>
        <div className="h-[calc(100%-44px)]">
          {rfNodes.length > 0 ? (
            <ReactFlowProvider>
              <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                fitView
                minZoom={0.3}
                maxZoom={1.5}
                proOptions={{ hideAttribution: true }}
                nodesDraggable={false}
                nodesConnectable={false}
              >
                <Background gap={16} size={1} />
                <Controls position="bottom-left" />
              </ReactFlow>
            </ReactFlowProvider>
          ) : (
            <div className="h-full flex items-center justify-center text-subtle text-sm">
              Empty graph — edit the JSON below to add nodes and edges.
            </div>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/60 flex items-center justify-between">
          <span className="label-section">Graph JSON · {`{nodes, edges}`} or {`{graph:{…}}`}</span>
          <button onClick={save} className="btn-primary text-xs">
            <Save className="h-3 w-3" />
            Save graph
          </button>
        </div>
        <MonacoEditor
          height="360px"
          language="json"
          value={json}
          onChange={(v) => setJson(v || '{}')}
          options={{ minimap: { enabled: false }, fontSize: 12 }}
        />
        {error && (
          <div className="px-4 py-2 border-t border-border/60 bg-danger/5 text-[11px] text-danger">{error}</div>
        )}
      </div>

      <div className="card p-4 text-[11.5px] text-subtle leading-relaxed">
        <div className="font-medium text-text mb-1.5">Supported node kinds</div>
        <ul className="space-y-0.5">
          <li><code className="text-text">input</code> — seeds the context with the rule input</li>
          <li><code className="text-text">ruleCall</code> — calls another rule by <code>data.ruleSlug</code> with <code>data.inputMap</code> ({'{{template}}'} into context); writes to <code>data.outputAs</code></li>
          <li><code className="text-text">assign</code> / <code className="text-text">transform</code> — eval JS <code>data.expression</code>, write to <code>data.target</code></li>
          <li><code className="text-text">branch</code> — eval <code>data.condition</code>, takes the <code>true</code>/<code>false</code> handle</li>
          <li><code className="text-text">output</code> — terminate; <code>data.return</code> shapes the output via {'{{ctx}}'} templates</li>
        </ul>
      </div>
    </div>
  );
}
