'use client';
// Model — Train (Data Set, algorithm, parameters, search) · Versions (evaluation, report, gate, publish) · Try (predict).
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { usePerms } from '@/lib/perms';
import { PageHead, Panel, Table, Td, Tag, Btn, Input, TextArea, Notice, Tabs, fmtTime } from '@/components/pipeline/ui';
import { Dropdown } from '@/components/pipeline/Dropdown';

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
const fmt = (v: any) => typeof v === 'number' ? (Math.abs(v) >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : Number(v.toFixed(4)).toString()) : v ?? '—';
const HEADLINE: Record<string, string> = { classification: 'f1', regression: 'r2', clustering: 'silhouette' };
const STATUS_TONE: Record<string, any> = { training: 'blue', ready: 'gray', published: 'green', failed: 'red', retired: 'gray' };

export default function ModelPage() {
  const { projectId, modelId } = useParams<{ projectId: string; modelId: string }>();
  const [tab, setTab] = useState('Train');
  const { data: m } = useQuery({ queryKey: ['model', modelId], queryFn: () => api.get<any>(`/models/${modelId}`) });
  const { data: versions = [] } = useQuery({ queryKey: ['model-versions', modelId], queryFn: () => api.get<any[]>(`/models/${modelId}/versions`),
    refetchInterval: q => ((q.state.data as any[]) || []).some(v => v.status === 'training') ? 2000 : false });
  if (!m) return <div className="px-8 py-6" />;
  const live = versions.find((v: any) => v.status === 'published');
  return (
    <div className="px-8 py-6">
      <PageHead title={m.name} sub={<><span className="font-mono">{m.slug}</span> · {live ? `v${live.version} live` : 'not published'} · {versions.length} version{versions.length === 1 ? '' : 's'}</>} />
      <Tabs tabs={['Train', 'Versions', 'Try']} value={tab} onChange={setTab} />
      {tab === 'Train' && <TrainTab modelId={m.id} projectId={projectId} onStarted={() => setTab('Versions')} last={versions[0]} />}
      {tab === 'Versions' && <VersionsTab model={m} versions={versions} />}
      {tab === 'Try' && <TryTab versions={versions} />}
    </div>
  );
}

function TrainTab({ modelId, projectId, onStarted, last }: { modelId: string; projectId: string; onStarted: () => void; last?: any }) {
  const qc = useQueryClient(); const perms = usePerms();
  const { data: cat } = useQuery({ queryKey: ['ml-catalogue'], queryFn: () => api.get<any>('/models/ml/catalogue'), retry: false });
  const { data: sets = [] } = useQuery({ queryKey: ['data-sets', '_integration'], queryFn: () => api.get<any[]>(`/data/datasets?project_id=_integration`) });
  const prev = last?.config || {};
  const [f, setF] = useState<any>({ dataset: prev.dataset || '', algorithm: prev.algorithm || '', target: prev.target || '', features: prev.features || [], params: prev.params || {}, scaler: prev.scaler || 'standard', testSize: String(prev.testSize ?? 0.2), search: '' });
  const ds = (sets as any[]).find(d => d.slug === f.dataset);
  const { data: sample } = useQuery({ queryKey: ['ds-rows', ds?.active?.id, 'train'], queryFn: () => api.get<any[]>(`/data/datasets/${ds.id}/snapshots/${ds.active.id}/rows?limit=20`), enabled: !!ds?.active?.id });
  const columns = useMemo(() => Array.from(new Set((sample || []).flatMap((r: any) => Object.keys(r.data || {})))), [sample]);
  const algo = cat?.algorithms?.find((a: any) => a.id === f.algorithm);
  useEffect(() => { if (algo) setF((x: any) => ({ ...x, params: Object.fromEntries(Object.entries(algo.params).map(([k, p]: any) => [k, x.params?.[k] ?? p.default])) })); }, [f.algorithm]); // eslint-disable-line
  const train = useMutation({
    mutationFn: () => {
      let search: any = null;
      if (f.search.trim()) { const g = JSON.parse(f.search); search = { type: 'grid', params: g, cv: 3 }; }
      return api.post(`/models/${modelId}/train`, { dataset: f.dataset, algorithm: f.algorithm, target: algo?.task === 'clustering' ? null : f.target, features: f.features, params: f.params, scaler: f.scaler, testSize: Number(f.testSize), search });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['model-versions', modelId] }); onStarted(); },
  });
  if (cat === undefined) return <Notice kind="warning">The ML service is not reachable — training is unavailable</Notice>;
  return (
    <div className="space-y-4">
      <Panel title="1 · Data">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><div className="text-[12px] text-[#525252] mb-1.5">Data Set</div><Dropdown value={f.dataset} onChange={v => setF({ ...f, dataset: v, target: '', features: [] })} placeholder="Choose a Data Set"
            options={(sets as any[]).map(d => ({ value: d.slug, label: d.slug, hint: `${d.rowCount.toLocaleString()} rows` }))} /></div>
          {algo?.task !== 'clustering' && <div><div className="text-[12px] text-[#525252] mb-1.5">Target (what to predict)</div><Dropdown value={f.target} onChange={v => setF({ ...f, target: v, features: f.features.filter((x: string) => x !== v) })} placeholder="Choose a column" options={columns.map(c => ({ value: c, label: c }))} /></div>}
        </div>
        {columns.length > 0 && <div className="mt-4"><div className="text-[12px] text-[#525252] mb-1.5">Features (inputs)</div>
          <div className="flex flex-wrap gap-1.5">{columns.filter(c => c !== f.target).map(c => {
            const on = f.features.includes(c);
            return <button key={c} type="button" aria-pressed={on} onClick={() => setF({ ...f, features: on ? f.features.filter((x: string) => x !== c) : [...f.features, c] })}
              className={`h-8 px-3 text-[13px] font-mono border ${on ? 'bg-[#0f62fe] text-white border-[#0f62fe]' : 'bg-white border-[#c6c6c6] hover:bg-[#e8e8e8]'}`}>{c}</button>;
          })}</div></div>}
      </Panel>
      <Panel title="2 · Model and parameters">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><div className="text-[12px] text-[#525252] mb-1.5">Algorithm</div><Dropdown value={f.algorithm} onChange={v => setF({ ...f, algorithm: v })} placeholder="Choose an algorithm"
            options={(cat?.algorithms || []).map((a: any) => ({ value: a.id, label: a.label, hint: a.task }))} /></div>
          <div><div className="text-[12px] text-[#525252] mb-1.5">Scaling</div><Dropdown value={f.scaler} onChange={v => setF({ ...f, scaler: v })}
            options={[{ value: 'standard', label: 'Standard' }, { value: 'minmax', label: 'Min-Max' }, { value: 'robust', label: 'Robust' }, { value: 'center', label: 'Centering only' }, { value: 'none', label: 'None' }]} /></div>
          {algo?.task !== 'clustering' && <Input id="tr-test" label="Test share (0–0.5)" mono value={f.testSize} onChange={(v: string) => setF({ ...f, testSize: v })} />}
          {algo && Object.entries(algo.params).map(([k, p]: any) => (
            <Input key={k} id={`tr-p-${k}`} label={`${k} (${p.type})`} mono value={String(f.params[k] ?? '')} onChange={(v: string) => setF({ ...f, params: { ...f.params, [k]: v } })} />
          ))}
        </div>
        {algo && Object.keys(algo.params).length > 0 && algo.task !== 'clustering' && <div className="mt-4">
          <TextArea id="tr-search" label='Parameter search (optional) — values to try, e.g. { "max_depth": [3, 6, 10] }' rows={3} value={f.search} onChange={(v: string) => setF({ ...f, search: v })} />
        </div>}
      </Panel>
      {train.error && <Notice kind="error">{(train.error as any).message}</Notice>}
      {perms.write && <Btn onClick={() => train.mutate()} disabled={!f.dataset || !f.algorithm || !f.features.length || (algo?.task !== 'clustering' && !f.target) || train.isPending}>Start training</Btn>}
    </div>
  );
}

function VersionsTab({ model, versions }: { model: any; versions: any[] }) {
  const qc = useQueryClient(); const perms = usePerms();
  const [open, setOpen] = useState<string | null>(versions[0]?.id ?? null);
  const gate0 = model.config?.gate;
  const [gate, setGate] = useState({ metric: gate0?.metric || '', min: gate0?.min !== undefined ? String(gate0.min) : '' });
  const inv = () => { qc.invalidateQueries({ queryKey: ['model-versions', model.id] }); qc.invalidateQueries({ queryKey: ['model', model.id] }); };
  const saveGate = useMutation({ mutationFn: () => api.put(`/models/${model.id}/gate`, { metric: gate.metric || undefined, min: gate.min === '' ? null : Number(gate.min) }), onSuccess: inv });
  const publish = useMutation({ mutationFn: (vid: string) => api.post(`/models/versions/${vid}/publish`), onSuccess: inv });
  const sel = versions.find(v => v.id === (open ?? versions[0]?.id));   // newest version by default
  const openReport = async (vid: string) => {
    const token = localStorage.getItem('xrules_token');
    const tenant = JSON.parse(localStorage.getItem('xrules-auth') || '{}')?.state?.workspace?.slug;
    const r = await fetch(`${BASE}/models/versions/${vid}/report.html`, { headers: { Authorization: `Bearer ${token}`, ...(tenant ? { 'X-Tenant': tenant } : {}) } });
    const w = window.open('', '_blank'); if (w) { w.document.write(await r.text()); w.document.close(); }
  };
  return (
    <div className="space-y-4">
      <Panel title="Evaluation gate" actions={perms.write ? <Btn kind="tertiary" onClick={() => saveGate.mutate()} disabled={saveGate.isPending}>Save</Btn> : undefined}>
        <div className="grid grid-cols-1 md:grid-cols-[220px_200px_1fr] gap-4 items-end">
          <div><div className="text-[12px] text-[#525252] mb-1.5">Metric</div><Dropdown value={gate.metric} onChange={v => setGate({ ...gate, metric: v })} placeholder="Headline metric"
            options={['f1', 'accuracy', 'precision', 'recall', 'auc', 'r2', 'mae', 'rmse', 'silhouette'].map(x => ({ value: x, label: x }))} /></div>
          <Input id="gate-min" label="Minimum to publish" mono value={gate.min} onChange={(v: string) => setGate({ ...gate, min: v })} placeholder="0.8" />
          <div className="text-[13px] text-[#525252] pb-2">{gate0 ? `Now: ${gate0.metric} ≥ ${gate0.min}` : 'No gate — any trained version can be published'}</div>
        </div>
      </Panel>
      {publish.error && <Notice kind="error">{(publish.error as any).message}</Notice>}
      <Table head={['Version', 'Status', 'Algorithm', 'Data Set', 'Headline', 'Trained', '']}>
        {versions.map(v => {
          const task = v.report?.task; const h = HEADLINE[task];
          return (
            <tr key={v.id} className={`cursor-pointer ${sel?.id === v.id ? 'bg-[#e8e8e8]' : 'hover:bg-[#f4f4f4]'}`} onClick={() => setOpen(v.id)}>
              <Td mono>v{v.version}</Td>
              <Td><Tag tone={STATUS_TONE[v.status]}>{v.status}</Tag></Td>
              <Td mono>{v.config.algorithm}</Td>
              <Td mono>{v.config.dataset}</Td>
              <Td mono>{h && v.report?.metrics?.[h] !== undefined ? `${h} ${fmt(v.report.metrics[h])}` : '—'}</Td>
              <Td>{fmtTime(v.trainedAt)}</Td>
              <Td className="text-right">{perms.write && (v.status === 'ready' || v.status === 'retired') && <button className="h-8 px-3 text-[#0f62fe] hover:bg-[#e0e0e0]" onClick={e => { e.stopPropagation(); publish.mutate(v.id); }}>Publish</button>}</Td>
            </tr>
          );
        })}
      </Table>
      {sel && <Panel title={`Version ${sel.version} · evaluation`} actions={sel.report ? <Btn kind="tertiary" onClick={() => openReport(sel.id)}>Open report</Btn> : undefined}>
        {sel.status === 'training' && <div className="text-[14px] text-[#525252]">Training…</div>}
        {sel.status === 'failed' && <Notice kind="error">{sel.error}</Notice>}
        {sel.report && <Evaluation r={sel.report} />}
      </Panel>}
    </div>
  );
}

function Evaluation({ r }: { r: any }) {
  return (
    <div className="space-y-4">
      <Table head={Object.keys(r.metrics || {})}><tr>{Object.values(r.metrics || {}).map((v, i) => <Td key={i} mono>{fmt(v)}</Td>)}</tr></Table>
      <div className="text-[13px] text-[#525252]">{r.rows} rows{r.split ? ` · ${r.split.train} train / ${r.split.test} test` : ''} · scaling {r.scaler} · {Object.entries(r.params || {}).map(([k, v]) => `${k}=${v}`).join(', ') || 'default parameters'}{r.search ? ` · search tried ${r.search.tried}, best ${JSON.stringify(r.search.best)}` : ''}</div>
      {r.confusion && <div>
        <div className="text-[14px] font-semibold mb-2">Confusion matrix</div>
        <table className="text-[13px] font-mono"><thead><tr><th className="px-3 py-1 text-left font-normal text-[#525252]">actual \ predicted</th>{r.confusion.labels.map((l: string) => <th key={l} className="px-3 py-1 font-normal text-[#525252]">{l}</th>)}</tr></thead>
          <tbody>{r.confusion.matrix.map((row: number[], i: number) => <tr key={i}><th className="px-3 py-1 text-left font-normal">{r.confusion.labels[i]}</th>{row.map((x, j) => <td key={j} className={`px-3 py-1 text-center ${i === j ? 'bg-[#defbe6]' : x ? 'bg-[#fff1f1]' : ''}`}>{x}</td>)}</tr>)}</tbody></table>
      </div>}
      {r.importance?.length > 0 && <div>
        <div className="text-[14px] font-semibold mb-2">Feature importance</div>
        <div className="space-y-1">{r.importance.map((x: any) => <div key={x.feature} className="grid grid-cols-[180px_1fr_60px] items-center gap-3 text-[13px]"><span className="font-mono truncate">{x.feature}</span>
          <span className="h-3 bg-[#e0e0e0]"><span className="block h-3 bg-[#0f62fe]" style={{ width: `${x.score * 100}%` }} /></span><span className="font-mono text-right">{(x.score * 100).toFixed(1)}%</span></div>)}</div>
      </div>}
      {r.clusters && <Table head={['Cluster', 'Rows']}>{r.clusters.map((c: any) => <tr key={c.cluster}><Td mono>{c.cluster}</Td><Td mono>{c.size}</Td></tr>)}</Table>}
    </div>
  );
}

function TryTab({ versions }: { versions: any[] }) {
  const usable = versions.filter(v => ['published', 'ready', 'retired'].includes(v.status));
  const [vid, setVid] = useState(usable.find(v => v.status === 'published')?.id || usable[0]?.id || '');
  const v = versions.find(x => x.id === vid);
  const example = v ? JSON.stringify([Object.fromEntries((v.config.features || []).map((f: string) => [f, '']))], null, 2) : '[]';
  const [rows, setRows] = useState(example);
  useEffect(() => setRows(example), [vid]); // eslint-disable-line
  const run = useMutation({ mutationFn: () => api.post<any>(`/models/versions/${vid}/predict`, { rows: JSON.parse(rows) }) });
  if (!usable.length) return <div className="text-[14px] text-[#525252]">Train a version first</div>;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <Panel title="Input rows">
        <div className="w-64 mb-3"><Dropdown value={vid} onChange={setVid} options={usable.map(x => ({ value: x.id, label: `v${x.version}`, hint: x.status }))} /></div>
        <TextArea id="try-rows" rows={10} value={rows} onChange={setRows} />
        <div className="mt-3"><Btn onClick={() => run.mutate()} disabled={run.isPending}>Predict</Btn></div>
      </Panel>
      <Panel title="Result">
        {run.error && <Notice kind="error">{(run.error as any).message}</Notice>}
        {run.data && <Table head={['#', 'Prediction', 'Probability']}>{run.data.results.map((r: any, i: number) => <tr key={i}><Td mono>{i + 1}</Td><Td mono>{String(r.prediction)}</Td><Td mono>{r.probability !== undefined ? fmt(r.probability) : '—'}</Td></tr>)}</Table>}
      </Panel>
    </div>
  );
}
