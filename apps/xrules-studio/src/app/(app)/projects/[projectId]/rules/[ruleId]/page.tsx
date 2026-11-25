'use client';
import { InputFields, ResultView, inputFieldsOf, outputFieldsOf } from '@/components/test/FieldsEditor';
import { TestSheet } from '@/components/test/TestSheet';
import { TestBadge } from '@/components/test/TestBadge';

import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Sparkles, BookOpen, History, Settings, Code2, ListChecks, Save, Rocket, Lock, Unlock, GitCompare, Check, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { PageContent } from '@/components/layout/AppShell';
import { StatusPill, Pill } from '@/components/ui/Pill';
import { rulesApi, simulationsApi, api } from '@/lib/api';
import { TableDesigner } from '@/components/rule/TableDesigner';
import { DecisionTableView } from '@/components/rule/DecisionTableView';
import { useTerms } from '@/lib/terms';
import { RuleRelations } from '@/components/pipeline/Relations';
import { TreeDesigner } from '@/components/rule/TreeDesigner';
import { ScriptingDesigner } from '@/components/rule/ScriptingDesigner';
import { LookupDesigner } from '@/components/rule/LookupDesigner';
import { AIAgentDesigner } from '@/components/rule/AIAgentDesigner';
import { ScorecardDesigner } from '@/components/rule/ScorecardDesigner';
import { RuleFlowDesigner } from '@/components/rule/RuleFlowDesigner';
import { SchemaFields, toFields, toSchema, type SField } from '@/components/rule/SchemaFields';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

type TabKey = 'definition' | 'schemas' | 'test' | 'simulate' | 'api' | 'versions' | 'settings';

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'definition', label: 'Definition', icon: Code2 },
  { key: 'schemas',    label: 'Schemas',    icon: ListChecks },
  { key: 'test',       label: 'Test',       icon: Send },
  { key: 'simulate',   label: 'Simulate',   icon: Sparkles },
  { key: 'api',        label: 'API',        icon: BookOpen },
  { key: 'versions',   label: 'Versions',   icon: History },
  { key: 'settings',   label: 'Settings',   icon: Settings },
];

export default function RuleDetailPage() {
  const { projectId, ruleId } = useParams<{ projectId: string; ruleId: string }>();
  const qc = useQueryClient();
  // the open tab lives in the URL: /p/{project}/rules/{rule}/{tab}
  const pathname = usePathname() || '';
  const router = useRouter();
  const sp = useSearchParams();
  const seg = pathname.split('/')[5] || sp?.get('tab') || '';
  const tab: TabKey = (seg === 'tests' ? 'test' : (TABS.some(t => t.key === seg) ? seg : 'definition')) as TabKey;
  const setTab = (t: TabKey) => router.replace(`/p/${projectId}/rules/${ruleId}${t === 'definition' ? '' : `/${t === 'test' ? 'tests' : t}`}`, { scroll: false });

  const { data: rule, isLoading } = useQuery({
    queryKey: ['rule', ruleId],
    queryFn: () => rulesApi.get(ruleId),
  });

  const publish = useMutation({
    mutationFn: () => rulesApi.publish(ruleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rule', ruleId] }),
  });

  if (isLoading || !rule) {
    return <PageContent><div className="text-subtle font-mono">Loading…</div></PageContent>;
  }

  return (
    <PageContent>
      {/* Compact header — rule meta + actions */}
      <div className="flex items-start gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Link href={`/p/${projectId}/rules`} className="text-xs text-subtle font-mono hover:text-text">RULES</Link>
            <span className="text-subtle/50">/</span>
            <span className="font-mono text-xs text-subtle">{rule.slug}</span>
            <span className="text-subtle/50">·</span>
            <span className="text-xs text-subtle">{String(rule.type || '').replace(/_/g, ' ').toLowerCase()}</span>
            {rule.alias && rule.alias !== rule.slug && <span className="font-mono text-xs text-subtle">@{rule.alias}</span>}
            {rule.strategy && rule.strategy !== 'standard' && <span className="text-xs text-subtle">· {rule.strategy}</span>}
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight truncate min-w-0">{rule.name}</h1>
            <StatusPill status={rule.status} />
            <span className="text-xs text-subtle font-mono shrink-0">v{rule.version}</span>
            {rule.locked && <Pill tone="warn"><Lock className="h-2.5 w-2.5 inline mr-0.5" />locked</Pill>}
          </div>
          {rule.description && <p className="text-sm text-subtle mt-1">{rule.description}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button className="btn-ghost text-xs" onClick={() => {
            const evt = new CustomEvent('xrules:open-compare', { detail: { ruleId: rule.id } });
            window.dispatchEvent(evt);
          }} title="Compare versions">
            <GitCompare className="h-3.5 w-3.5" />
          </button>
          <button className="btn-ghost text-xs" onClick={async () => {
            await api.patch(rule.locked ? `/rules/${rule.id}/unlock` : `/rules/${rule.id}/lock`);
            qc.invalidateQueries({ queryKey: ['rule', rule.id] });
          }} title={rule.locked ? 'Unlock' : 'Lock'}>
            {rule.locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          </button>
          <TestBadge targetType="rule" targetId={rule.id} onOpen={() => setTab('test')} />
          <button className="btn-primary" onClick={() => publish.mutate()} disabled={publish.isPending || rule.locked}>
            <Rocket className="h-3.5 w-3.5" />
            {publish.isPending ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>

      <CompareModal ruleId={rule.id} currentVersion={rule.version} />

      <RuleRelations ruleId={rule.id} home={projectId} />

      {/* Tabs */}
      <div className="tabs-row mb-6 max-w-full overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`tab inline-flex items-center gap-1.5 ${tab === key ? 'tab-active' : ''}`}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'definition' && <DefinitionTab rule={rule} projectId={projectId} />}
      {tab === 'schemas'    && <SchemasTab    rule={rule} />}
      {/* kept mounted so what was typed survives switching tabs */}
      <div className={tab === 'test' ? 'space-y-8' : 'hidden'}>
        <TestSheet targetType="rule" targetId={rule.id} inputs={inputFieldsOf(rule)} outputs={outputFieldsOf(rule)} projectId={projectId} />
        <div>
          <div className="text-[16px] text-[#161616] mb-3">Try once</div>
          <TestTab rule={rule} projectId={projectId} />
        </div>
      </div>
      {tab === 'simulate'   && <SimulateTab   rule={rule} projectId={projectId} />}
      {tab === 'api'        && <ApiTab        rule={rule} />}
      {tab === 'versions'   && <VersionsTab   ruleId={ruleId} />}
      {tab === 'settings'   && <SettingsTab   rule={rule} />}
    </PageContent>
  );
}

// =============================================================================

function DefinitionTab({ rule, projectId }: { rule: any; projectId: string }) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (patch: any) => rulesApi.update(rule.id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rule', rule.id] }),
  });
  // every keystroke used to PUT straight away; replies could land out of order and leave an older definition saved
  const pending = useRef<any>({});
  const timer = useRef<any>(null);
  const flush = () => { clearTimeout(timer.current); const p = pending.current; pending.current = {}; if (Object.keys(p).length) save.mutate(p); };
  useEffect(() => () => flush(), []);   // leaving the tab saves what is pending
  const mut = { mutate: (patch: any) => { Object.assign(pending.current, patch); clearTimeout(timer.current); timer.current = setTimeout(flush, 500); } };
  const t = String(rule.type || '').toUpperCase();

  if (t === 'DECISION_TABLE') {
    return (
      <DecisionTableView rule={rule} projectId={projectId} onChange={(def) => mut.mutate({ definition: def })} />
    );
  }
  if (t === 'DECISION_TREE') {
    return (
      <TreeDesigner
        definition={rule.definition}
        inputSchema={rule.inputSchema}
        outputSchema={rule.outputSchema}
        onChange={(def) => mut.mutate({ definition: def })}
      />
    );
  }
  if (t === 'SCRIPT' || t === 'FORMULA') {
    return (
      <ScriptingDesigner
        definition={rule.definition}
        ruleVariables={rule.ruleVariables}
        onChange={(def) => mut.mutate({ definition: def })}
        onVariablesChange={(vars) => mut.mutate({ ruleVariables: vars })}
      />
    );
  }
  if (t === 'LOOKUP') {
    return (
      <LookupDesigner
        definition={rule.definition}
        onChange={(def) => mut.mutate({ definition: def })}
      />
    );
  }
  if (t === 'AI_AGENT') {
    return (
      <AIAgentDesigner
        definition={rule.definition}
        projectId={projectId}
        inputSchema={rule.inputSchema}
        ruleVariables={rule.ruleVariables}
        onChange={(def) => mut.mutate({ definition: def })}
      />
    );
  }
  if (t === 'SCORECARD') {
    return (
      <ScorecardDesigner
        definition={rule.definition}
        onChange={(def) => mut.mutate({ definition: def })}
      />
    );
  }
  if (t === 'RULE_FLOW') {
    return (
      <RuleFlowDesigner
        definition={rule.definition}
        onChange={(def) => mut.mutate({ definition: def })}
      />
    );
  }

  if (t === 'MODEL_CALL') return <ModelCallDefinition rule={rule} projectId={projectId} onSave={(d) => mut.mutate({ definition: d })} saving={save.isPending} />;

  // Fallback raw JSON for any other type
  return <RawJsonDefinition rule={rule} onSave={(d) => mut.mutate({ definition: d })} />;
}

function ModelCallDefinition({ rule, projectId, onSave, saving }: { rule: any; projectId: string; onSave: (d: any) => void; saving: boolean }) {
  const d0 = rule.definition || {};
  const [d, setD] = useState({ model: d0.model || '', version: d0.version ? String(d0.version) : '', forEach: d0.forEach || '', fields: (d0.fields || []).join(', ') });
  const { data: models = [] } = useQuery({ queryKey: ['models', projectId], queryFn: () => api.get<any[]>(`/models?project_id=${projectId}`) });
  const picked = (models as any[]).find(m => m.slug === d.model);
  const { data: versions = [] } = useQuery({ queryKey: ['model-versions', picked?.id], queryFn: () => api.get<any[]>(`/models/${picked.id}/versions`), enabled: !!picked?.id });
  const usable = (versions as any[]).filter(v => ['published', 'retired'].includes(v.status));
  return (
    <div className="card p-5 space-y-4 max-w-3xl">
      <div>
        <label className="label-section block mb-1.5">Model</label>
        <div className="flex flex-wrap gap-1.5">{(models as any[]).map(m => (
          <button key={m.id} type="button" aria-pressed={d.model === m.slug} onClick={() => setD({ ...d, model: m.slug, version: '' })}
            className={`h-8 px-3 text-[13px] border ${d.model === m.slug ? 'bg-[#0f62fe] text-white border-[#0f62fe]' : 'bg-white border-[#c6c6c6] hover:bg-[#e8e8e8]'}`}>{m.name}</button>
        ))}</div>
      </div>
      {d.model && <div>
        <label className="label-section block mb-1.5">Version</label>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" aria-pressed={!d.version} onClick={() => setD({ ...d, version: '' })}
            className={`h-8 px-3 text-[13px] border ${!d.version ? 'bg-[#0f62fe] text-white border-[#0f62fe]' : 'bg-white border-[#c6c6c6] hover:bg-[#e8e8e8]'}`}>Published (follows new publishes)</button>
          {usable.map(v => (
            <button key={v.id} type="button" aria-pressed={d.version === String(v.version)} onClick={() => setD({ ...d, version: String(v.version) })}
              className={`h-8 px-3 text-[13px] border font-mono ${d.version === String(v.version) ? 'bg-[#0f62fe] text-white border-[#0f62fe]' : 'bg-white border-[#c6c6c6] hover:bg-[#e8e8e8]'}`}>v{v.version} · {v.status}</button>
          ))}
        </div>
      </div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><label htmlFor="mc-each" className="label-section block mb-1.5">Predict for each item in (optional)</label><input id="mc-each" className="input w-full font-mono" value={d.forEach} onChange={e => setD({ ...d, forEach: e.target.value })} placeholder="items" /></div>
        <div><label htmlFor="mc-fields" className="label-section block mb-1.5">Input fields (comma separated, optional)</label><input id="mc-fields" className="input w-full font-mono" value={d.fields} onChange={e => setD({ ...d, fields: e.target.value })} placeholder="amount, qty, strategy" /></div>
      </div>
      <button className="btn-primary disabled:opacity-50" disabled={!d.model || saving}
        onClick={() => onSave({ model: d.model, ...(d.version ? { version: Number(d.version) } : {}), ...(d.forEach ? { forEach: d.forEach } : {}), ...(d.fields.trim() ? { fields: d.fields.split(',').map((x: string) => x.trim()).filter(Boolean) } : {}) })}>Save</button>
    </div>
  );
}

function RawJsonDefinition({ rule, onSave }: { rule: any; onSave: (d: any) => void }) {
  const [val, setVal] = useState(JSON.stringify(rule.definition || {}, null, 2));
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <span className="label-section">{rule.type?.toLowerCase().replace('_', ' ')} · raw json</span>
        <button className="btn-ghost text-xs" onClick={() => {
          try { onSave(JSON.parse(val)); setError(null); } catch (e: any) { setError(e.message); }
        }}>Save</button>
      </div>
      <MonacoEditor
        height="540px"
        language="json"
        value={val}
        onChange={(v) => setVal(v || '')}
        options={{ minimap: { enabled: false }, fontSize: 13 }}
      />
      {error && <div className="px-4 py-2 pill pill-danger m-3">{error}</div>}
    </div>
  );
}

function SchemasTab({ rule }: { rule: any }) {
  const qc = useQueryClient();
  const [inF, setInF] = useState<SField[]>(() => toFields(rule.inputSchema));
  const [outF, setOutF] = useState<SField[]>(() => toFields(rule.outputSchema));
  const [mode, setMode] = useState<'fields' | 'json'>('fields');
  const [inJ, setInJ] = useState('');
  const [outJ, setOutJ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const toJson = () => { setInJ(JSON.stringify(toSchema(inF, rule.inputSchema), null, 2)); setOutJ(JSON.stringify(toSchema(outF, rule.outputSchema), null, 2)); };
  const switchMode = (m: 'fields' | 'json') => {
    setErr(null);
    if (m === 'json') { toJson(); setMode(m); return; }
    try { setInF(toFields(JSON.parse(inJ))); setOutF(toFields(JSON.parse(outJ))); setMode(m); } catch (e: any) { setErr('JSON is not valid — ' + e.message); }
  };
  const mut = useMutation({
    mutationFn: () => {
      let i: any, o: any;
      if (mode === 'json') { i = JSON.parse(inJ); o = JSON.parse(outJ); } else { i = toSchema(inF, rule.inputSchema); o = toSchema(outF, rule.outputSchema); }
      return rulesApi.update(rule.id, { inputSchema: i, outputSchema: o });
    },
    onMutate: () => setErr(null),
    onSuccess: () => { setSavedAt(Date.now()); qc.invalidateQueries({ queryKey: ['rule', rule.id] }); },
    onError: (e: any) => setErr(e.message),
  });
  const box = (title: string, f: SField[], setF: (x: SField[]) => void, j: string, setJ: (x: string) => void) => (
    <div className="card overflow-hidden">
      <div className="px-4 h-11 flex items-center border-b border-border text-[14px] font-semibold text-[#161616]">{title}</div>
      {mode === 'fields' ? <SchemaFields fields={f} onChange={x => { setF(x); setSavedAt(null); }} />
        : <MonacoEditor height="420px" language="json" value={j} onChange={v => { setJ(v || ''); setSavedAt(null); }} options={{ minimap: { enabled: false }, fontSize: 13 }} />}
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex border border-[#c6c6c6]">
          {(['fields', 'json'] as const).map(m => (
            <button key={m} className={`h-8 px-3 text-[13px] ${mode === m ? 'bg-[#161616] text-white' : 'text-[#525252] hover:bg-[#f4f4f4]'}`} onClick={() => mode !== m && switchMode(m)}>{m === 'fields' ? 'Fields' : 'JSON'}</button>
          ))}
        </div>
        {err && <span className="text-[13px] text-[#da1e28] truncate">{err}</span>}
        <div className="ml-auto flex items-center gap-3">
          {savedAt && !mut.isPending && <span className="text-[13px] text-[#24a148] flex items-center gap-1"><Check className="h-4 w-4" /> Saved</span>}
          <button className="btn-primary" onClick={() => mut.mutate()} disabled={mut.isPending}><Save className="h-3.5 w-3.5" />{mut.isPending ? 'Saving' : 'Save'}</button>
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {box('Input', inF, setInF, inJ, setInJ)}
        {box('Output', outF, setOutF, outJ, setOutJ)}
      </div>
    </div>
  );
}

function TestTab({ rule, projectId }: { rule: any; projectId: string }) {
  const { label } = useTerms(projectId);
  // sample from the input schema; a Decision Table without one gets its condition columns
  const sampleInput = useMemo(() => {
    const fromSchema = sampleFromSchema(rule.inputSchema);
    if (fromSchema && Object.keys(fromSchema).length) return fromSchema;
    const cols: any[] = (rule.definition as any)?.inputs || [];
    const out: Record<string, any> = {};
    cols.forEach((c: any) => { if (c?.name) out[c.name] = c.type === 'number' ? 0 : c.type === 'boolean' ? false : ''; });
    return out;
  }, [rule.inputSchema, rule.definition]);
  const [input, setInput] = useState(() => JSON.stringify(sampleInput, null, 2));
  const edited = useRef(false);
  useEffect(() => { if (!edited.current) setInput(JSON.stringify(sampleInput, null, 2)); }, [sampleInput]);
  const [output, setOutput] = useState<any>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setError(null); setOutput(null); setExecutionId(null); setDuration(null);
    let parsed: any;
    try { parsed = JSON.parse(input); } catch (e: any) { setError(`Input is not valid JSON — ${e.message}`); return; }
    setRunning(true);
    try {
      const t0 = Date.now();
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('xrules_token')}` },
        body: JSON.stringify({ rule_id: rule.id, input: parsed, context: {} }),
      });
      const json = await res.json();
      setDuration(Date.now() - t0);
      if (!json.success && json.error) {
        setError(json.error.message || 'Failed');
      } else {
        const data = json.data || json;
        setOutput(data.output);
        setExecutionId(data.id || null);
        // Persist trace globally so TableDesigner picks it up on remount.
        try {
          (window as any).__xrulesLastTrace = { ruleId: rule.id, input: parsed, output: data.output };
        } catch {}
        window.dispatchEvent(new CustomEvent('xrules:test-trace', {
          detail: { ruleId: rule.id, output: data.output, input: parsed }
        }));
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  function reset() {
    edited.current = false;
    setInput(JSON.stringify(sampleInput, null, 2));
    setOutput(null); setError(null); setDuration(null); setExecutionId(null);
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="label-section">Input</span>
            <button onClick={reset} className="btn-ghost text-[11px] text-subtle hover:text-text">reset</button>
          </div>
          <button onClick={run} disabled={running} className="btn-primary text-xs disabled:opacity-50">
            <Send className="h-3 w-3" />
            {running ? 'Running…' : 'Run'}
          </button>
        </div>
        <div className="p-4 h-[450px] overflow-auto">
          <InputFields title="" label={label} fields={inputFieldsOf(rule).length ? inputFieldsOf(rule) : Object.keys(sampleInput || {}).map(name => ({ name }))}
            value={(() => { try { return JSON.parse(input || '{}'); } catch { return {}; } })()}
            onChange={v => { edited.current = true; setInput(JSON.stringify(v, null, 2)); }} />
        </div>
      </div>
      <div className="card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <span className="label-section">Output</span>
          <div className="flex items-center gap-3 font-mono text-[11px] text-subtle tabular-nums">
            {duration !== null && <span>{duration}ms</span>}
            {executionId && <span className="opacity-60">{executionId.slice(0, 10)}…</span>}
          </div>
        </div>
        <div className="p-4 h-[450px] overflow-auto font-mono text-xs">
          {error && (
            <div className="pill pill-danger mb-2">
              <X className="h-3 w-3" /> {error}
            </div>
          )}
          {output !== null && output !== undefined && (
            <>
              <div className="pill pill-ok mb-2">
                <Check className="h-3 w-3" /> Success
              </div>
              <ResultView value={output} label={label} />
            </>
          )}

        </div>
      </div>
    </div>
  );
}

// Generate a plausible sample object from a JSON Schema 2020-12 subset.
function sampleFromSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return {};
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.type === 'object' || schema.properties) {
    const out: any = {};
    for (const [k, v] of Object.entries<any>(schema.properties || {})) {
      out[k] = sampleFromSchema(v);
    }
    return out;
  }
  if (schema.type === 'array') return [sampleFromSchema(schema.items || {})];
  if (schema.type === 'string') return schema.enum?.[0] || schema.format === 'date-time' ? new Date().toISOString() : '';
  if (schema.type === 'number' || schema.type === 'integer') return schema.minimum ?? 0;
  if (schema.type === 'boolean') return false;
  if (schema.enum) return schema.enum[0];
  return null;
}

function SimulateTab({ rule, projectId }: { rule: any; projectId: string }) {
  const [mode, setMode] = useState<'diff' | 'replay' | 'sweep'>('diff');
  const [versionA, setVersionA] = useState(1);
  const [versionB, setVersionB] = useState(rule.version);
  const [input, setInput] = useState('{}');
  const [result, setResult] = useState<any>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true); setResult(null);
    try {
      const body: any = { projectId, ruleId: rule.id, name: `${mode} ${rule.slug}` };
      if (mode === 'diff') Object.assign(body, { versionA, versionB, input: JSON.parse(input) });
      if (mode === 'replay') Object.assign(body, { versionA, versionB, sampleSize: 50 });
      if (mode === 'sweep') Object.assign(body, { version: rule.version, baseInput: JSON.parse(input), axis: 'value', values: [1, 2, 3, 4, 5] });
      const res = await (mode === 'diff' ? simulationsApi.diff(body) : mode === 'replay' ? simulationsApi.replay(body) : simulationsApi.sweep(body));
      setResult(res);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="tabs-row mb-4">
          {(['diff', 'replay', 'sweep'] as const).map((m) => (
            <button key={m} className={`tab ${mode === m ? 'tab-active' : ''}`} onClick={() => setMode(m)}>
              {m}
            </button>
          ))}
        </div>

        {mode === 'diff' && (
          <div className="space-y-3">
            <p className="text-xs text-subtle">Run the same input through two versions side-by-side.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-section block mb-1.5">Version A</label>
                <input type="number" className="input w-full" value={versionA} onChange={(e) => setVersionA(Number(e.target.value))} />
              </div>
              <div>
                <label className="label-section block mb-1.5">Version B</label>
                <input type="number" className="input w-full" value={versionB} onChange={(e) => setVersionB(Number(e.target.value))} />
              </div>
            </div>
            <div>
              <label className="label-section block mb-1.5">Input JSON</label>
              <MonacoEditor height="180px" language="json" value={input} onChange={(v) => setInput(v || '{}')}
                options={{ minimap: { enabled: false }, fontSize: 13 }} />
            </div>
          </div>
        )}

        {mode === 'replay' && (
          <div className="space-y-3">
            <p className="text-xs text-subtle">Replay last 50 production executions on version A vs B. See how many diverge.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-section block mb-1.5">Version A (champion)</label>
                <input type="number" className="input w-full" value={versionA} onChange={(e) => setVersionA(Number(e.target.value))} />
              </div>
              <div>
                <label className="label-section block mb-1.5">Version B (challenger)</label>
                <input type="number" className="input w-full" value={versionB} onChange={(e) => setVersionB(Number(e.target.value))} />
              </div>
            </div>
          </div>
        )}

        {mode === 'sweep' && (
          <div className="space-y-3">
            <p className="text-xs text-subtle">Vary one axis to see output curve (sensitivity analysis).</p>
            <div>
              <label className="label-section block mb-1.5">Base Input</label>
              <MonacoEditor height="180px" language="json" value={input} onChange={(v) => setInput(v || '{}')}
                options={{ minimap: { enabled: false }, fontSize: 13 }} />
            </div>
          </div>
        )}

        <div className="flex justify-end mt-4">
          <button className="btn-primary" onClick={run} disabled={running}>
            <Sparkles className="h-3.5 w-3.5" />
            {running ? 'Running…' : 'Run simulation'}
          </button>
        </div>
      </div>

      {result && (
        <div className="card p-4">
          <div className="label-section mb-2">Result</div>
          <pre className="font-mono text-xs whitespace-pre-wrap text-text overflow-auto max-h-[400px]">{JSON.stringify(result.result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

function ApiTab({ rule }: { rule: any }) {
  // Outside systems call a rule through a REST API (Integration › REST APIs) with a key that may call that API.
  const { data } = useQuery({ queryKey: ['used-by', 'rule', rule.id], queryFn: () => api.get<any>(`/rules/${rule.id}/used-by`) });
  const [tenant] = useState(() => { try { return JSON.parse(localStorage.getItem('xrules-auth') || '{}')?.state?.workspace?.slug || ''; } catch { return ''; } });
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const apiBase = `${origin}${process.env.NEXT_PUBLIC_BACKEND_URL || ''}/api/${tenant}`;
  const sample: Record<string, any> = {};
  ((rule.definition as any)?.inputs || []).forEach((c: any) => { if (c?.name) sample[c.name] = c.type === 'number' ? 0 : ''; });
  const ops: any[] = data?.operations || [];
  return (
    <div className="space-y-4">
      {ops.length === 0 && (
        <div className="card p-4 flex items-center justify-between gap-4">
          <div className="text-[14px] text-[#161616]">Not on a REST API yet</div>
          <Link href="/apis" className="btn-primary">REST APIs</Link>
        </div>
      )}
      {ops.map((o: any) => {
        const url = `${apiBase}/${o.spec.basePath}/v${o.spec.version}${o.path}`;
        const curl = `curl -X ${o.method} '${url}' \\\n  -H 'Content-Type: application/json' \\\n  -H 'X-API-Key: YOUR_API_KEY'${o.method === 'GET' ? '' : ` \\\n  -d '${JSON.stringify(sample)}'`}`;
        return (
          <div key={o.id} className="card p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="font-mono text-[14px] break-all"><span className="text-[#0f62fe]">{o.method}</span> {url}</div>
              <Link href={`/apis/${o.spec.id}`} className="btn-ghost">Open API</Link>
            </div>
            <pre className="p-3 overflow-x-auto text-xs font-mono text-text bg-[#f4f4f4] m-0">{curl}</pre>
          </div>
        );
      })}
    </div>
  );
}

function VersionsTab({ ruleId }: { ruleId: string }) {
  const { data: versions = [] } = useQuery({
    queryKey: ['rule-versions', ruleId],
    queryFn: () => rulesApi.versions(ruleId),
  });
  if (!versions.length) return <div className="card p-8 text-center text-subtle text-sm">No published versions yet</div>;
  return (
    <div className="card overflow-hidden">
      <table className="w-full">
        <thead className="bg-muted/30 border-b border-border">
          <tr className="text-left">
            <th className="py-3 px-4 label-section w-12">#</th>
            <th className="py-3 px-4 label-section">Version</th>
            <th className="py-3 px-4 label-section">Status</th>
            <th className="py-3 px-4 label-section">Message</th>
            <th className="py-3 px-4 label-section text-right">Created</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((v: any, i: number) => (
            <tr key={v.id} className="border-b border-border/50">
              <td className="py-3 px-4 row-index">{String(i + 1).padStart(2, '0')}</td>
              <td className="py-3 px-4 font-mono">v{v.version}</td>
              <td className="py-3 px-4"><StatusPill status={v.status} /></td>
              <td className="py-3 px-4 text-sm text-subtle">{v.message || '—'}</td>
              <td className="py-3 px-4 text-right font-mono text-xs text-subtle tabular-nums">
                {new Date(v.createdAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SettingsTab({ rule }: { rule: any }) {
  const qc = useQueryClient();
  const [tags, setTags] = useState((rule.tags || []).join(', '));
  const [confirm, setConfirm] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['rule'] }); qc.invalidateQueries({ queryKey: ['rules'] }); };
  const saveTags = useMutation({ mutationFn: () => rulesApi.update(rule.id, { tags: tags.split(',').map((t: string) => t.trim()).filter(Boolean) }), onSuccess: refresh });
  const setStatus = useMutation({ meta: { silent: true }, mutationFn: (status: string) => rulesApi.update(rule.id, { status }), onSuccess: () => { setConfirm(false); refresh(); } });
  const archived = String(rule.status).toLowerCase() === 'archived';
  const tagsDirty = tags !== (rule.tags || []).join(', ');
  return (
    <div className="card p-6 space-y-4">
      <div>
        <label htmlFor="rs-slug" className="label-section block mb-1.5">Slug</label>
        <input id="rs-slug" className="input w-full max-w-md font-mono" defaultValue={rule.slug} disabled />
      </div>
      <div>
        <label htmlFor="rs-engine" className="label-section block mb-1.5">Engine</label>
        <input id="rs-engine" className="input w-full max-w-md font-mono" defaultValue={rule.engine} disabled />
      </div>
      <div>
        <label htmlFor="rs-tags" className="label-section block mb-1.5">Tags</label>
        <div className="flex gap-2 max-w-xl">
          <input id="rs-tags" className="input flex-1" placeholder="e.g. pricing, kyc" value={tags} onChange={e => setTags(e.target.value)} />
          <button className="btn-primary disabled:opacity-40" disabled={!tagsDirty || saveTags.isPending} onClick={() => saveTags.mutate()}>Save tags</button>
        </div>
      </div>
      <div className="pt-4 border-t border-border flex items-center gap-2">
        {archived ? (
          <><span className="text-sm text-subtle">This rule is archived.</span>
            <button className="btn-outline" onClick={() => setStatus.mutate('draft')} disabled={setStatus.isPending}>Restore as draft</button></>
        ) : confirm ? (
          <><span className="text-sm">Archive {rule.name}? Flows that call it keep their pinned version.</span>
            <button className="btn-outline text-danger border-danger/30 hover:bg-danger/10" onClick={() => setStatus.mutate('archived')} disabled={setStatus.isPending}>Archive</button>
            <button className="btn-ghost" onClick={() => setConfirm(false)}>Cancel</button></>
        ) : (
          <button className="btn-outline text-danger border-danger/30 hover:bg-danger/10" onClick={() => setConfirm(true)}>Archive rule</button>
        )}
        {setStatus.error && <span className="pill pill-danger">{(setStatus.error as any).message}</span>}
      </div>
    </div>
  );
}


function CompareModal({ ruleId, currentVersion }: { ruleId: string; currentVersion: number }) {
  const [open, setOpen] = useState(false);
  const [a, setA] = useState(1);
  const [b, setB] = useState(currentVersion);
  const [data, setData] = useState<any>(null);

  if (typeof window !== "undefined") {
    window.addEventListener("xrules:open-compare", (e: any) => {
      if (e.detail?.ruleId === ruleId) setOpen(true);
    });
  }

  async function run() {
    const res = await api.get<any>(`/rules/${ruleId}/compare?a=${a}&b=${b}`);
    setData(res);
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 z-50" onClick={() => setOpen(false)}>
      <div className="card w-full max-w-4xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-border flex items-center gap-3">
          <h2 className="font-bold">Compare Versions</h2>
          <input type="number" className="input h-7 w-20 text-xs" value={a} onChange={(e) => setA(Number(e.target.value))} />
          <span className="text-subtle">vs</span>
          <input type="number" className="input h-7 w-20 text-xs" value={b} onChange={(e) => setB(Number(e.target.value))} />
          <button className="btn-primary text-xs" onClick={run}>Diff</button>
          <button className="btn-ghost ml-auto text-xs" onClick={() => setOpen(false)}>Close</button>
        </div>
        <div className="flex-1 overflow-auto p-4 grid grid-cols-2 gap-4 font-mono text-xs">
          <div>
            <div className="label-section mb-1">v{a}</div>
            <pre className="bg-muted p-3 rounded whitespace-pre-wrap">{data ? JSON.stringify(data.a?.definition, null, 2) : "(run diff)"}</pre>
          </div>
          <div>
            <div className="label-section mb-1">v{b}</div>
            <pre className="bg-muted p-3 rounded whitespace-pre-wrap">{data ? JSON.stringify(data.b?.definition, null, 2) : "(run diff)"}</pre>
          </div>
          {data?.diff?.definition && (
            <div className="col-span-2">
              <div className="label-section mb-1">Changes ({data.diff.definition.length})</div>
              <ul className="space-y-1">
                {data.diff.definition.map((d: any, i: number) => (
                  <li key={i} className={`text-[11px] ${d.op === "add" ? "text-ok" : d.op === "remove" ? "text-danger" : "text-warn"}`}>
                    [{d.op}] {d.path}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

