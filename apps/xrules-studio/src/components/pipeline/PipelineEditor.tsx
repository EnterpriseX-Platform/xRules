'use client';
// Pipeline editor shared by Data Flows and Decision Flows (MaintainX / Carbon g10 look):
// title + live version, undo/redo, lock, publish state, Save draft / Publish vN,
// dotted canvas with Tidy up / Add step, zoom control, and "Build with AI".
import Link from 'next/link';
import { LinksBar } from '@/components/links/Links';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ReactFlow,
  Background, BackgroundVariant, MarkerType, ReactFlowProvider, addEdge, applyEdgeChanges, applyNodeChanges,
  useReactFlow, useViewport, type Connection, type Edge, type Node as RFNode, type NodeChange, type EdgeChange,
} from '@xyflow/react';
type Node = RFNode<any>;
import '@xyflow/react/dist/style.css';
import { Undo2, Redo2, Lock, Unlock, Plus, LayoutGrid, Minus, Maximize2, Sparkles, Play, Eye, X } from 'lucide-react';
import { api, flowsApi } from '@/lib/api';
import { pipelineNodeTypes } from './PipelineNode';
import dagre from '@dagrejs/dagre';
import { STEPS, metaFor, type FlowKindName } from './registry';
import { StepInspector } from './StepInspector';
import { TraceView } from './TraceView';
import { FlowRelations } from './Relations';
import { InputFields, flowFields } from '@/components/test/FieldsEditor';
import { TestSheet } from '@/components/test/TestSheet';
import { TestBadge } from '@/components/test/TestBadge';
import { Modal } from './ui';
import { GoLive } from '@/components/GoLive';
import { StrategySteps } from '@/components/topic/StrategySteps';
import { useTerms } from '@/lib/terms';

type Graph = { nodes: Node[]; edges: Edge[] };
const EDGE = { type: 'default', style: { stroke: '#3B4752', strokeOpacity: .55, strokeWidth: 1.8 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#3B4752', width: 16, height: 16 } } as const;
const RUN_EDGE = { style: { stroke: '#2E9A5B', strokeWidth: 3 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#2E9A5B', width: 16, height: 16 } };
const styleEdges = (es: Edge[]) => es.map(e => ({ ...EDGE, ...e, id: e.id || `${e.source}-${e.target}-${e.sourceHandle || ''}`, animated: false }));

export function PipelineEditor(props: { projectId: string; flowId: string; backHref: string; backLabel: string }) {
  return <ReactFlowProvider><Inner {...props} /></ReactFlowProvider>;
}

/** Tidy up with dagre, left to right, the way Robot Factory lays out a flow. */
function tidy(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 64, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach(n => g.setNode(n.id, { width: 168, height: 76 }));
  edges.forEach(e => { if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target); });
  dagre.layout(g);
  return nodes.map(n => { const p = g.node(n.id); return p ? { ...n, position: { x: Math.round(p.x - 84), y: Math.round(p.y - 38) } } : n; });
}

function Inner({ projectId, flowId, backHref, backLabel }: { projectId: string; flowId: string; backHref: string; backLabel: string }) {
  const qc = useQueryClient();
  const rf = useReactFlow();
  const { zoom } = useViewport();
  const { data: flow } = useQuery({ queryKey: ['flow', flowId], queryFn: () => flowsApi.get(flowId) });
  const kind: FlowKindName = (flow?.kind || 'decision') as FlowKindName;

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [locked, setLocked] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [view, setView] = useState<'steps' | 'canvas' | null>(null);
  const { label: termLabel } = useTerms(projectId);
  const [casesOpen, setCasesOpen] = useState(false);
  const [testInput, setTestInput] = useState('{}');
  const { data: projRules } = useQuery({ queryKey: ['rules', flow?.projectId], queryFn: () => api.get<any>(`/rules?project_id=${flow?.projectId}`), enabled: !!flow?.projectId });
  const ruleList: any[] = Array.isArray(projRules) ? projRules : ((projRules as any)?.data || (projRules as any)?.items || []);
  const [testResult, setTestResult] = useState<any | null>(null);
  const past = useRef<Graph[]>([]); const future = useRef<Graph[]>([]);

  const load = useCallback((f: any) => {
    const g = f?.graph || { nodes: [], edges: [] };
    let ns: Node[] = (g.nodes || []).map((n: any) => ({ ...n, position: n.position || { x: 0, y: 0 } }));
    if (ns.filter(n => !n.position || (n.position.x === 0 && n.position.y === 0)).length > 1) ns = tidy(ns, g.edges || []);
    // the trigger shows the flow's schedule
    if (f?.kind === 'data') ns = ns.map(n => n.type === 'trigger' ? { ...n, data: { ...n.data, ...(f.schedule || {}) } } : n);
    setNodes(ns); setEdges(styleEdges(g.edges || [])); setDirty(false);
    past.current = []; future.current = [];
  }, []);
  useEffect(() => { if (flow) load(flow); }, [flow, load]);

  const snapshot = useCallback(() => { past.current.push({ nodes, edges }); if (past.current.length > 100) past.current.shift(); future.current = []; }, [nodes, edges]);
  const commit = useCallback((ns: Node[], es: Edge[]) => { snapshot(); setNodes(ns); setEdges(es); setDirty(true); }, [snapshot]);
  const undo = () => { const p = past.current.pop(); if (!p) return; future.current.push({ nodes, edges }); setNodes(p.nodes); setEdges(p.edges); setDirty(true); };
  const redo = () => { const f = future.current.pop(); if (!f) return; past.current.push({ nodes, edges }); setNodes(f.nodes); setEdges(f.edges); setDirty(true); };

  const onNodesChange = useCallback((ch: NodeChange[]) => {
    const removing = ch.filter(c => c.type === 'remove').map((c: any) => c.id);
    const filtered = ch.filter((c: any) => !(c.type === 'remove' && metaFor(nodes.find(n => n.id === c.id)?.type).locked));
    if (removing.length || ch.some(c => c.type === 'position' && (c as any).dragging === false)) snapshot();
    setNodes(nds => applyNodeChanges(filtered, nds));
    // a click fires a position change with the same position: only a real move or removal is an edit
    const moved = (c: any) => c.type === 'position' && c.position && (() => { const n = nodes.find(x => x.id === c.id); return !n || Math.abs(n.position.x - c.position.x) > 0.5 || Math.abs(n.position.y - c.position.y) > 0.5; })();
    if (filtered.some((c: any) => (c.type !== 'select' && c.type !== 'dimensions' && c.type !== 'position') || moved(c))) setDirty(true);
  }, [nodes, snapshot]);
  const onEdgesChange = useCallback((ch: EdgeChange[]) => {
    if (ch.some(c => c.type === 'remove')) snapshot();
    setEdges(es => applyEdgeChanges(ch, es));
    if (ch.some(c => c.type !== 'select')) setDirty(true);
  }, [snapshot]);
  const onConnect = useCallback((c: Connection) => { snapshot(); setEdges(es => addEdge({ ...c, ...EDGE } as any, es)); setDirty(true); }, [snapshot]);

  // the inspector may fill defaults when it opens; only a different value is an edit
  const updateNode = (id: string, data: any) => {
    const cur = nodes.find(n => n.id === id);
    if (cur && JSON.stringify(cur.data) === JSON.stringify(data)) return;
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data } : n)); setDirty(true);
  };
  const removeNode = (id: string) => { commit(nodes.filter(n => n.id !== id), edges.filter(e => e.source !== id && e.target !== id)); setSelectedId(null); };

  // A new step goes after the selected step (or the last one) — and before an end step such as
  // API Response, so Input → Rule → Response instead of Input → Response → Rule.
  const isEnd = (n: Node) => /response|output/i.test(String(n.type));
  const addStep = (k: string) => {
    const m = metaFor(k); const id = `${k}-${Date.now().toString(36)}`;
    const rightmost = [...nodes].sort((a, b) => b.position.x - a.position.x)[0];
    let from = selectedId ? nodes.find(n => n.id === selectedId) : rightmost;
    if (from && isEnd(from) && !selectedId) from = nodes.find(n => edges.some(e => e.source === n.id && e.target === from!.id)) ?? from;
    const nextEdge = from ? edges.find(e => e.source === from!.id) : undefined;
    const next = nextEdge ? nodes.find(n => n.id === nextEdge.target) : undefined;
    const pos = from ? { x: from.position.x + 300, y: from.position.y } : { x: 40, y: 60 };
    const n: Node = { id, type: k, position: pos, data: { label: m.title } };
    let es = edges;
    let ns = [...nodes];
    if (from && next) {
      // insert between: from → new → next, and move everything right of the new step along
      es = [...edges.filter(e => e !== nextEdge), { ...EDGE, id: `${from.id}-${id}`, source: from.id, target: id } as Edge, { ...EDGE, id: `${id}-${next.id}`, source: id, target: next.id } as Edge];
      ns = ns.map(x => (x.position.x >= pos.x - 1 ? { ...x, position: { ...x.position, x: x.position.x + 300 } } : x));
    } else if (from) {
      es = [...edges, { ...EDGE, id: `${from.id}-${id}`, source: from.id, target: id } as Edge];
    }
    commit([...ns, n], es); setSelectedId(id); setAddOpen(false);
  };

  const graphToSave = () => ({
    nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
    edges: edges.map(({ id, source, target, sourceHandle, targetHandle }) => ({ id, source, target, sourceHandle, targetHandle })),
  });
  const save = useMutation({
    mutationFn: async () => {
      const body: any = { graph: graphToSave() };
      const trig = nodes.find(n => n.type === 'trigger');
      if (kind === 'data' && trig) body.schedule = { cron: trig.data?.cron || undefined, events: trig.data?.events || [], enabled: trig.data?.enabled !== false };
      return flowsApi.update(flowId, body);
    },
    onSuccess: () => { setDirty(false); qc.invalidateQueries({ queryKey: ['flow', flowId] }); },
  });
  const publish = useMutation({
    mutationFn: async () => { if (dirty) await save.mutateAsync(); return api.post(`/flows/${flowId}/publish`, {}); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flow', flowId] }),
  });
  // values from the last test run, shown on each box (display only, never saved)
  const shown = useMemo(() => {
    const steps: any[] = testResult?.trace || []; if (!steps.length) return nodes;
    const f = (n: any) => Number(n).toLocaleString('en-US');
    const line = (t: any) => { const o = t.output || {};
      if (t.status === 'error') return 'Failed';
      switch (String(t.kind).toLowerCase()) {
        case 'items': return `${f(o.count)} items`;
        case 'screen': return `${f(o.kept)} kept · ${f(o.removed)} out`;
        case 'score': return `${f(o.scored)} scored · average ${o.average ?? '—'}`;
        case 'rank': return `Top priority ${o.top ?? '—'}`;
        case 'pick': return o.left !== undefined ? `${f(o.picked)} picked · ${f(o.used)} used · ${f(o.left)} left` : `${f(o.picked)} picked`;
        default: return t.status === 'skipped' ? 'Skipped' : undefined; } };
    const by = new Map(steps.map(t => [t.nodeId, t]));
    return nodes.map(n => { const t = by.get(n.id); const out = t && line(t); return t ? { ...n, data: { ...n.data, __out: out, __status: t.status } } : n; });
  }, [nodes, testResult]);
  const shownEdges = useMemo(() => {
    const steps: any[] = testResult?.trace || []; if (!steps.length) return edges;
    const by = new Map(steps.map(t => [t.nodeId, t]));
    const count = (t: any) => { const o = t?.output || {}; return o.kept ?? o.picked ?? o.count ?? o.ranked ?? o.scored; };
    return edges.map(e => {
      const a = by.get(e.source), b = by.get(e.target);
      if (!a || !b || a.status !== 'ok') return e;
      const c = count(a);
      return { ...e, ...RUN_EDGE, ...(c != null ? { label: Number(c).toLocaleString('en-US'), labelShowBg: true, labelBgPadding: [6, 2] as [number, number], labelBgBorderRadius: 10, labelBgStyle: { fill: '#2E9A5B' }, labelStyle: { fill: '#fff', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, fontWeight: 600 } } : {}) };
    });
  }, [edges, testResult]);
  const testRun = useMutation({
    mutationFn: async () => {
      let input: any;
      try { input = JSON.parse(testInput || '{}'); } catch (e: any) { return { error: `Input is not valid JSON — ${e.message}` }; }
      return api.post<any>(`/flows/${flowId}/run`, { graph: graphToSave(), input });
    },
    onSuccess: r => setTestResult(r),
    onError: (e: any) => setTestResult({ error: e.message }),
  });
  const runNow = useMutation({ meta: { failLabel: "Couldn't run" }, mutationFn: () => api.post<any>(`/data/flows/${flowId}/run`), onSuccess: r => setPreview({ ...r, mode: 'run' }) });
  const runTrigger = useMutation({ mutationFn: () => api.post<any>(`/platform/triggers/${flowId}/run-now`, {}), onSuccess: r => setPreview({ ok: !r.error, mode: 'run', rowCount: undefined, error: r.error, trace: undefined, traceSteps: r.trace }), onError: (e: any) => setPreview({ ok: false, mode: 'run', error: e.message }) });
  const doPreview = useMutation({ mutationFn: async () => { if (dirty) await save.mutateAsync(); return api.post<any>(`/data/flows/${flowId}/preview`); }, onSuccess: r => setPreview({ ...r, mode: 'preview' }) });

  const buildAi = useMutation({
    mutationFn: async () => {
      const kinds = STEPS.filter(s => s.flows.includes(kind)).map(s => s.kind).join(', ');
      const content = `Change the following ${kind} flow as requested and reply with the whole graph as JSON only, shaped {"nodes":[{"id","type","data"}],"edges":[{"source","target"}]} allowed types: ${kinds}\n\nCurrent graph:\n${JSON.stringify(graphToSave())}\n\nRequest: ${aiText}`;
      const r = await api.post<any>('/assistant/chat', { projectId: flow.projectId, messages: [{ role: 'user', content }] });
      const m = String(r?.reply || '').match(/\{[\s\S]*\}/);
      if (!m) throw new Error('The AI did not return a graph');
      const g = JSON.parse(m[0]);
      if (!Array.isArray(g.nodes) || !Array.isArray(g.edges)) throw new Error('The returned graph is incomplete');
      return g;
    },
    onSuccess: g => { const keep = new Map(nodes.map(n => [n.id, n.position])); const ns = tidy(g.nodes.map((n: any) => ({ ...n, position: keep.get(n.id) || { x: 0, y: 0 } })), g.edges); commit(ns, styleEdges(g.edges)); setAiText(''); setAiMsg('AI drafted the change; review it before publishing'); },
    onError: (e: any) => setAiMsg(e?.message || 'Could not build the change'),
  });

  const selected = useMemo(() => nodes.find(n => n.id === selectedId) || null, [nodes, selectedId]);
  if (!flow) return <div className="p-8 text-[#525252]" />;

  const published = flow.status === 'published';
  const liveVersion = published ? flow.version : Math.max(flow.version - 1, 0);
  const pendingReview = (flow as any)?.reviewState === 'PENDING';
  const state = dirty ? { dot: '#f1c21b', text: 'Unsaved changes' } : pendingReview ? { dot: '#0f62fe', text: 'Waiting for approval' } : published ? { dot: '#24a148', text: `Live v${flow.version}` } : { dot: '#8d8d8d', text: 'Draft' };
  const isStrategy = nodes.some(n => ['items', 'screen', 'score', 'rank', 'pick'].includes(String(n.type)));
  const shownView = view ?? (isStrategy ? 'steps' : 'canvas');
  const runOf = (k: string) => (testResult?.trace || []).find((t: any) => String(t.kind).toLowerCase() === k)?.output;
  const run = testResult?.trace ? { start: runOf('items')?.count, kept: runOf('screen')?.kept, picked: runOf('pick')?.picked, used: runOf('pick')?.used } : null;
  const groups = Array.from(new Set(STEPS.filter(s => s.flows.includes(kind) && !s.locked).map(s => s.group)));

  return (
    <div className="h-[calc(100vh-48px)] flex flex-col bg-[#f4f4f4]">
      {/* header */}
      <div className="bg-white border-b border-[#e0e0e0] px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 min-w-0">
        <div className="min-w-[min(100%,260px)]">
          <div className="text-[13px] flex gap-2">{(flow as any).topicId
            ? <><Link href={`/p/${projectId}/topics`} className="text-[#0f62fe] hover:underline">Topics</Link><span className="text-[#6f6f6f]">/</span><Link href={`/p/${projectId}/topics/${(flow as any).topicId}/choose`} className="text-[#0f62fe] hover:underline">Topic</Link></>
            : backHref ? <Link href={backHref} className="text-[#0f62fe] hover:underline">{backLabel || 'Back'}</Link> : null}</div>
          <h1 className="text-[20px] leading-7 text-[#161616] break-words">{flow.name}</h1>
          {kind === 'decision' && <div className="mt-2"><LinksBar kind="flow" id={flowId} name={flow.name} href={`/p/${projectId}/flows/${flowId}`} /></div>}
        </div>
        <span className="flex items-center gap-1.5 text-[13px] text-[#525252] whitespace-nowrap"><span className="h-2 w-2 rounded-full" style={{ background: state.dot }} />{state.text}</span>
        {(save.error || publish.error) && <span className="text-[13px] text-[#da1e28] truncate">{String((save.error as any)?.message || (publish.error as any)?.message)}</span>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {isStrategy && <div role="tablist" aria-label="View" className="flex border border-[#8d8d8d] mr-2">{(['steps', 'canvas'] as const).map(v => <button key={v} role="tab" aria-selected={shownView === v} onClick={() => setView(v)} className={`h-9 px-4 text-[14px] ${shownView === v ? 'bg-[#161616] text-white' : 'hover:bg-[#e8e8e8]'}`}>{v === 'steps' ? 'Steps' : 'Canvas'}</button>)}</div>}
          {dirty && <button className="h-10 px-3 text-[14px] text-[#525252] hover:bg-[#e8e8e8]" onClick={() => load(flow)}>Discard</button>}
          {!published && !dirty && <button className="h-10 px-3 text-[14px] text-[#da1e28] hover:bg-[#fff1f1]" onClick={async () => { if (!window.confirm('Archive this flow? It leaves its topic and the list; its history is kept.')) return; await api.post(`/flows/${flowId}/archive`, {}); window.location.href = (flow as any).topicId ? `/p/${projectId}/topics/${(flow as any).topicId}/choose` : backHref; }}>Archive</button>}
          {kind === 'decision' && <button className={`h-10 px-4 text-[14px] border flex items-center gap-2 ${testOpen ? 'bg-[#161616] text-white border-[#161616]' : 'border-[#8d8d8d] text-[#161616] hover:bg-[#e8e8e8]'}`} onClick={() => { setTestOpen(o => !o); setSelectedId(null); }}><Play className="h-4 w-4" /> Test</button>}
          {kind === 'data' && <>
            <button className="h-10 px-4 text-[14px] border border-[#8d8d8d] hover:bg-[#e8e8e8] flex items-center gap-2 whitespace-nowrap" onClick={() => doPreview.mutate()} disabled={doPreview.isPending}><Eye className="h-4 w-4" /> Preview</button>
            <button className="h-10 px-4 text-[14px] border border-[#8d8d8d] hover:bg-[#e8e8e8] flex items-center gap-2 whitespace-nowrap disabled:text-[#8d8d8d]" onClick={() => runNow.mutate()} disabled={runNow.isPending || !published}><Play className="h-4 w-4" /> Run</button>
          </>}
          {kind === 'trigger' && <button className="h-10 px-4 text-[14px] border border-[#8d8d8d] hover:bg-[#e8e8e8] flex items-center gap-2 whitespace-nowrap disabled:text-[#8d8d8d]" onClick={() => runTrigger.mutate()} disabled={runTrigger.isPending || !published}><Play className="h-4 w-4" /> Run</button>}
          {kind === 'decision' && <TestBadge targetType="decision_flow" targetId={flowId} onOpen={() => setCasesOpen(true)} />}
          <button className="h-10 px-4 text-[14px] border border-[#8d8d8d] text-[#161616] hover:bg-[#e8e8e8] whitespace-nowrap disabled:text-[#8d8d8d] disabled:border-[#e0e0e0]" disabled={!dirty || save.isPending || locked} onClick={() => save.mutate()}>Save</button>
          {kind === 'decision' || kind === 'trigger'
            ? <GoLive targetType="decision_flow" targetId={flowId} reviewState={(flow as any)?.reviewState} disabled={locked || dirty} onPublish={() => publish.mutate()} publishing={publish.isPending} publishLabel={`Publish v${published && !dirty ? flow.version : flow.version + (published ? 1 : 0)}`} invalidate={[['flow', flowId]]} />
            : <button className="h-10 px-4 text-[14px] bg-[#0f62fe] text-white hover:bg-[#0353e9] whitespace-nowrap disabled:bg-[#c6c6c6]" disabled={publish.isPending || locked || (!dirty && published)} onClick={() => publish.mutate()}>Publish v{published && !dirty ? flow.version : flow.version + (published ? 1 : 0)}</button>}
        </div>
      </div>

      <FlowRelations flowId={flowId} home={projectId} />

      <div className="flex-1 flex min-h-0">
        {shownView === 'steps' && (
          <div className="flex-1 min-w-0 overflow-auto bg-[#f6f7f9] px-8 py-8" onClick={e => { if (e.target === e.currentTarget) setSelectedId(null); }}>
            <StrategySteps graph={{ nodes, edges }} label={termLabel} run={run} onPick={id => { setSelectedId(id); setTestOpen(false); }} picked={selectedId} />
            <div className="mt-6 text-[13px] text-[#525252]">Click a step to change it. Run a test to see counts on each step.</div>
          </div>
        )}
        {/* canvas */}
        <div className={`relative flex-1 min-w-0 ${shownView === 'steps' ? 'hidden' : ''}`}>
          <ReactFlow
            nodes={shown} edges={shownEdges} nodeTypes={pipelineNodeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
            onNodeClick={(_, n) => setSelectedId(n.id)} onPaneClick={() => { setSelectedId(null); setAddOpen(false); }}
            nodesDraggable={!locked} nodesConnectable={!locked} elementsSelectable
            deleteKeyCode={locked ? null : ['Backspace', 'Delete']}
            fitView fitViewOptions={{ padding: 0.3, maxZoom: 1 }} minZoom={0.3} maxZoom={1.6}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.3} color="#AEB8B6" bgColor="#EEF1F0" />
          </ReactFlow>

          <div className="absolute top-4 right-4 flex items-center gap-2">
            <button className="h-10 pl-3 pr-5 bg-white border border-[#e0e0e0] text-[14px] flex items-center gap-2 whitespace-nowrap hover:bg-[#e8e8e8]" disabled={locked} onClick={() => { commit(tidy(nodes, edges), edges); setTimeout(() => rf.fitView({ padding: 0.3, maxZoom: 1 }), 50); }}><LayoutGrid className="h-4 w-4" /> Tidy up</button>
            <div className="relative">
              <button className="h-10 pl-3 pr-5 bg-[#393939] text-white text-[14px] flex items-center gap-2 whitespace-nowrap hover:bg-[#474747]" disabled={locked} onClick={() => setAddOpen(o => !o)}><Plus className="h-4 w-4" /> Add step</button>
              {addOpen && (
                <div className="absolute right-0 mt-1 w-64 bg-white border border-[#e0e0e0] shadow-[0_2px_6px_rgba(0,0,0,.2)] z-30 max-h-[60vh] overflow-y-auto">
                  {groups.map(g => (
                    <div key={g}>
                      <div className="px-3 pt-3 pb-1 text-[12px] text-[#525252]">{g}</div>
                      {STEPS.filter(s => s.group === g && s.flows.includes(kind) && !s.locked).map(s => {
                        const Icon = s.icon;
                        return (
                          <button key={s.kind} className="w-full h-10 px-3 flex items-center gap-3 text-[14px] hover:bg-[#e8e8e8]" onClick={() => addStep(s.kind)}>
                            <span className="h-6 w-6 flex items-center justify-center" style={{ background: s.tile }}><Icon className="h-3.5 w-3.5" style={{ color: s.ink }} /></span>{s.title}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="absolute bottom-4 left-4 h-11 bg-white border border-[#e0e0e0] flex items-center">
            <button className="h-11 w-11 flex items-center justify-center hover:bg-[#e8e8e8]" onClick={() => rf.zoomOut()} aria-label="Zoom out"><Minus className="h-4 w-4" /></button>
            <span className="w-14 text-center text-[14px] tabular-nums">{Math.round(zoom * 100)}%</span>
            <button className="h-11 w-11 flex items-center justify-center hover:bg-[#e8e8e8]" onClick={() => rf.zoomIn()} aria-label="Zoom in"><Plus className="h-4 w-4" /></button>
            <button className="h-11 w-11 flex items-center justify-center hover:bg-[#e8e8e8]" onClick={() => rf.fitView({ padding: 0.3, maxZoom: 1 })} aria-label="Fit to screen"><Maximize2 className="h-4 w-4" /></button>
            <span className="h-6 w-px bg-[#e0e0e0]" />
            <button className="h-11 w-11 flex items-center justify-center hover:bg-[#e8e8e8] disabled:opacity-30" onClick={undo} disabled={!past.current.length || locked} aria-label="Undo"><Undo2 className="h-4 w-4" /></button>
            <button className="h-11 w-11 flex items-center justify-center hover:bg-[#e8e8e8] disabled:opacity-30" onClick={redo} disabled={!future.current.length || locked} aria-label="Redo"><Redo2 className="h-4 w-4" /></button>
            <button className={`h-11 w-11 flex items-center justify-center hover:bg-[#e8e8e8] ${locked ? 'bg-[#e0e0e0]' : ''}`} onClick={() => setLocked(l => !l)} aria-label={locked ? 'Unlock' : 'Lock editing'}>{locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}</button>
          </div>

          {!testOpen && (
            <div className="absolute top-4 left-4 right-[260px] max-w-[520px] h-10 bg-white border border-[#e0e0e0] flex items-center">
              <Sparkles className="h-4 w-4 mx-3 shrink-0 text-[#525252]" />
              <input className="flex-1 min-w-0 h-full text-[14px] outline-none bg-transparent" value={aiText} onChange={e => { setAiText(e.target.value); setAiMsg(null); }} placeholder={aiMsg || 'Change this flow with AI'} disabled={locked}
                onKeyDown={e => { if (e.key === 'Enter' && aiText.trim()) buildAi.mutate(); }} aria-label="Change this flow with AI" />
              {aiText.trim() && <button className="h-full px-4 text-[14px] bg-[#161616] text-white disabled:bg-[#8d8d8d]" disabled={buildAi.isPending || locked} onClick={() => buildAi.mutate()}>Build</button>}
            </div>
          )}
        </div>

        {casesOpen && (
          <Modal title="Test cases" wide="xl" onClose={() => setCasesOpen(false)}>
            {(() => { const ff = flowFields({ graph: { nodes } }, ruleList); return <TestSheet targetType="decision_flow" targetId={flowId} inputs={ff.inputs} outputs={ff.outputs} projectId={flow?.projectId} />; })()}
          </Modal>
        )}
        {testOpen && !selected && (
          <div className="w-[380px] shrink-0 bg-white border-l border-[#e0e0e0] flex flex-col min-h-0">
            <div className="h-12 px-4 flex items-center gap-3 border-b border-[#e0e0e0]">
              <span className="text-[14px] font-semibold text-[#161616]">Test</span>
              <button className="ml-auto h-8 w-8 flex items-center justify-center hover:bg-[#e8e8e8]" onClick={() => setTestOpen(false)} aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-4 border-b border-[#e0e0e0] space-y-2">
              <InputFields fields={flowFields({ graph: { nodes } }, ruleList).inputs}
                value={(() => { try { return JSON.parse(testInput || '{}'); } catch { return {}; } })()}
                onChange={v => setTestInput(JSON.stringify(v))} />
              <button className="h-10 w-full text-[14px] bg-[#0f62fe] text-white hover:bg-[#0353e9] disabled:bg-[#c6c6c6] flex items-center justify-center gap-2" disabled={testRun.isPending} onClick={() => testRun.mutate()}><Play className="h-4 w-4" /> Run</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {testResult && <div className="px-4 h-11 flex items-center gap-3 border-b border-[#e0e0e0]">
                <span className="text-[14px] font-semibold text-[#161616]">Result</span>
                {testResult.error ? <span className="text-[13px] text-[#a2191f]">Failed</span> : <span className="text-[13px] text-[#198038]">Passed</span>}
                {testResult.duration_ms !== undefined && <span className="ml-auto text-[12px] text-[#525252] tabular-nums">{testResult.duration_ms} ms</span>}
              </div>}
              {testResult?.error && <div className="px-4 py-3 text-[13px] text-[#a2191f]">{testResult.error}</div>}
              {testResult && 'output' in testResult && <pre className="px-4 py-3 font-mono text-[12px] text-[#161616] whitespace-pre-wrap break-all border-b border-[#e0e0e0]">{JSON.stringify(testResult.output, null, 2)}</pre>}
              {Array.isArray(testResult?.output?.picked) && <WhyList out={testResult.output} />}
              {testResult?.trace && <div className="px-2 py-2"><TraceView steps={testResult.trace} /></div>}
            </div>
          </div>
        )}
        {selected && <StepInspector node={selected} nodes={nodes} projectId={flow.projectId} onChange={updateNode} onRemove={removeNode} onClose={() => setSelectedId(null)} />}
      </div>

      {preview && <PreviewDrawer result={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function PreviewDrawer({ result, onClose }: { result: any; onClose: () => void }) {
  const rows: any[] = result.rows || [];
  const cols = Array.from(new Set(rows.flatMap(r => Object.keys(r)))).slice(0, 12);
  const ok = result.ok;
  return (
    <div className="h-[300px] bg-white border-t border-[#e0e0e0] flex flex-col">
      <div className="h-12 px-6 flex items-center gap-4 border-b border-[#e0e0e0]">
        <span className={`text-[13px] ${ok ? 'text-[#198038]' : 'text-[#da1e28]'}`}>{ok ? (result.mode === 'run' ? 'Run succeeded' : 'Passed') : 'Failed'}</span>
        <span className="text-[14px] text-[#161616]">
          {result.mode === 'run' ? (result.rowCount !== undefined ? `Saved ${result.rowCount} rows` : 'Run finished') : `${result.rowCount ?? rows.length} rows passed · ${result.rejectedCount ?? 0} rejected`}
          {result.error && <span className="text-[#a2191f]"> · {result.error}</span>}
        </span>
        {result.trace && <span className="text-[12px] text-[#525252] font-mono">{result.trace.map((t: any) => `${t.kind} ${t.rowsOut}`).join(' → ')}</span>}
        <button className="ml-auto h-8 w-8 flex items-center justify-center hover:bg-[#e8e8e8]" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 overflow-auto">
        {rows.length > 0 && (
          <table className="w-full text-[13px] tabular-nums">
            <thead className="sticky top-0 bg-[#e0e0e0]"><tr>{cols.map(c => <th key={c} className="text-left font-semibold px-4 h-10">{c}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-[#e0e0e0] hover:bg-[#e8e8e8]">{cols.map(c => <td key={c} className="px-4 h-10 whitespace-nowrap">{typeof r[c] === 'object' ? JSON.stringify(r[c]) : String(r[c] ?? '')}</td>)}</tr>)}</tbody>
          </table>
        )}
        {result.traceSteps && <div className="px-6 py-3"><TraceView steps={result.traceSteps} /></div>}
        {(result.rejected || []).length > 0 && (
          <div className="px-6 py-3 text-[13px]">
            <div className="text-[#525252] mb-1">Rejected rows</div>
            {result.rejected.slice(0, 20).map((x: any, i: number) => <div key={i} className="font-mono text-[12px]"><span className="text-[#a2191f]">{x.check}</span> · {JSON.stringify(x.row)}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}

function WhyList({ out }: { out: any }) {
  const name = (it: any) => it.name ?? it.title ?? it.project ?? it.id ?? it.code ?? '—';
  const money = (n: any) => Number(n).toLocaleString('en-US');
  return (
    <div className="border-b border-[#e0e0e0] text-[13px]">
      <div className="px-4 pt-3 pb-1 text-[14px] font-semibold text-[#161616]">Chosen {out.picked.length}{out.allocation ? ` · ${money(out.allocation.used)} of ${money(out.allocation.budget)}` : ''}</div>
      {out.picked.map((it: any, i: number) => <div key={i} className="px-4 py-1 flex gap-2"><span className="w-6 text-[#6f6f6f] tabular-nums">{it.rank ?? i + 1}</span><span className="flex-1">{name(it)}</span>{it.allocated !== undefined && <span className="tabular-nums">{money(it.allocated)}{it.partial ? ' (part)' : ''}</span>}</div>)}
      {!!out.dropped?.length && <>
        <div className="px-4 pt-3 pb-1 text-[14px] font-semibold text-[#161616]">Not chosen {out.dropped.length}</div>
        {out.dropped.map((it: any, i: number) => <div key={i} className="px-4 py-1"><div>{name(it)}</div><div className="text-[12px] text-[#525252]">{it.droppedAt}: {it.reason}</div></div>)}
      </>}
      <div className="h-2" />
    </div>
  );
}
