'use client';
// AI Agent designer — left sidebar (Model / Connector / toggles / Data Dictionary)
// + tabs (Prompt / Annotations / Explainable / Attachments).
// Definition shape:
// { modelConnectorId, model, cacheEnabled, explainable, prompt, annotations, attachments }
import { useState } from 'react';
import { Plus, Trash2, Bot, Lightbulb, Paperclip, Database } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { connectionsApi } from '@/lib/api';
import { cn } from '@/lib/cn';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

interface Annotation { field: string; type: 'text' | 'number' | 'boolean' | 'object' | 'array' | 'auto'; description: string }
interface Attachment { filename: string; ref: string }

export function AIAgentDesigner({
  definition, projectId, inputSchema, ruleVariables, onChange,
}: {
  definition: any;
  projectId: string;
  inputSchema?: any;
  ruleVariables?: any;
  onChange: (next: any) => void;
}) {
  const [tab, setTab] = useState<'prompt' | 'annotations' | 'explainable' | 'attachments'>('prompt');
  const [modelConnectorId, setModelConnectorId] = useState<string>(definition?.modelConnectorId || '');
  const [model, setModel] = useState<string>(definition?.model || '');
  const [cacheEnabled, setCacheEnabled] = useState<boolean>(!!definition?.cacheEnabled);
  const [explainable, setExplainable] = useState<boolean>(!!definition?.explainable);
  const [prompt, setPrompt] = useState<string>(definition?.prompt || 'You are a helpful assistant. Given the input fields, produce JSON matching the output schema.\n\nInput:\n{input}\n');
  const [annotations, setAnnotations] = useState<Annotation[]>(definition?.annotations || []);
  const [attachments, setAttachments] = useState<Attachment[]>(definition?.attachments || []);

  const { data: connections = [] } = useQuery({
    queryKey: ['connections', projectId],
    queryFn: () => connectionsApi.list(projectId),
  });
  // AI-model connectors specifically (filter by type if backend tags them)
  const aiConnectors = connections.filter((c: any) =>
    String(c.type).toLowerCase() === 'http' || c.meta?.kind === 'ai',
  );

  function emit(p: any = {}) {
    onChange({
      modelConnectorId, model, cacheEnabled, explainable, prompt, annotations, attachments,
      ...p,
    });
  }

  function setPart<K extends string>(key: K, value: any, alsoSet: () => void) {
    alsoSet();
    emit({ [key]: value });
  }

  return (
    <div className="grid grid-cols-[280px_1fr] gap-3">
      {/* Left sidebar */}
      <div className="card p-3 space-y-4">
        <div>
          <div className="label-section mb-1.5 flex items-center gap-1.5"><Bot className="h-3 w-3" /> AI Model</div>
          <input
            className="input w-full text-xs"
            placeholder="gpt-4o-mini · claude-haiku-4-5 · …"
            value={model}
            onChange={(e) => setPart('model', e.target.value, () => setModel(e.target.value))}
          />
        </div>
        <div>
          <div className="label-section mb-1.5">Connector</div>
          <select
            className="input w-full text-xs"
            value={modelConnectorId}
            onChange={(e) => setPart('modelConnectorId', e.target.value, () => setModelConnectorId(e.target.value))}
          >
            <option value="">— select connector —</option>
            {aiConnectors.map((c: any) => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
          </select>
          {aiConnectors.length === 0 && (
            <div className="text-[10px] text-subtle mt-1">Add a connection (Connections page) of type HTTP / AI Model first.</div>
          )}
        </div>
        <ToggleRow label="Cache AI Response" hint="Identical inputs return cached output."
          value={cacheEnabled} onChange={(v) => setPart('cacheEnabled', v, () => setCacheEnabled(v))} />
        <ToggleRow label="Explainable AI" hint="Auto-injects probability/reason/source_fragments/warnings."
          value={explainable} onChange={(v) => setPart('explainable', v, () => setExplainable(v))} />

        <div>
          <div className="label-section mb-1.5 flex items-center gap-1.5"><Database className="h-3 w-3" /> Data Dictionary</div>
          <div className="space-y-2 text-[10px] font-mono">
            <DictGroup label="Input fields" items={inputSchema?.properties ? Object.keys(inputSchema.properties) : []} prefix="" />
            <DictGroup label="Variables" items={ruleVariables ? Object.keys(ruleVariables) : []} prefix="variables." />
            <DictGroup label="Attachments" items={attachments.map(a => a.filename)} prefix="attachments." />
          </div>
        </div>
      </div>

      {/* Right: tabs + content */}
      <div className="card flex flex-col">
        <div className="border-b border-border p-2">
          <div className="tabs-row">
            <button className={`tab ${tab === 'prompt' ? 'tab-active' : ''}`} onClick={() => setTab('prompt')}>Prompt</button>
            <button className={`tab ${tab === 'annotations' ? 'tab-active' : ''}`} onClick={() => setTab('annotations')}>Annotations</button>
            <button className={`tab ${tab === 'explainable' ? 'tab-active' : ''}`} onClick={() => setTab('explainable')} disabled={!explainable}>Explainable</button>
            <button className={`tab ${tab === 'attachments' ? 'tab-active' : ''}`} onClick={() => setTab('attachments')}>Attachments</button>
          </div>
        </div>

        {tab === 'prompt' && (
          <div className="flex-1">
            <MonacoEditor
              height="500px"
              language="markdown"
              value={prompt}
              onChange={(v) => setPart('prompt', v || '', () => setPrompt(v || ''))}
              options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: 'on' }}
            />
            <div className="px-4 py-2 border-t border-border text-[10px] font-mono text-subtle">
              Variables: <span className="text-accent">&#123;input.foo&#125;</span> <span className="text-accent">&#123;variables.taxRate&#125;</span> <span className="text-accent">&#123;attachments.policy.pdf&#125;</span>
            </div>
          </div>
        )}

        {tab === 'annotations' && (
          <AnnotationsTab
            annotations={annotations}
            outputFields={[]}
            onChange={(a) => setPart('annotations', a, () => setAnnotations(a))}
          />
        )}

        {tab === 'explainable' && (
          <div className="p-4 space-y-2 text-xs font-mono">
            <Lightbulb className="h-4 w-4 text-warn inline" /> Auto-injected output fields:
            <ul className="list-disc list-inside text-subtle space-y-1 mt-2">
              <li><code>probability</code> — model confidence (0..1)</li>
              <li><code>reason</code> — short rationale string</li>
              <li><code>source_fragments</code> — supporting input excerpts</li>
              <li><code>warnings</code> — flags for low confidence / missing data</li>
            </ul>
          </div>
        )}

        {tab === 'attachments' && (
          <AttachmentsTab attachments={attachments} onChange={(a) => setPart('attachments', a, () => setAttachments(a))} />
        )}
      </div>
    </div>
  );
}

function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
      <div>
        <div className="text-xs font-medium">{label}</div>
        {hint && <div className="text-[10px] text-subtle">{hint}</div>}
      </div>
    </label>
  );
}

function DictGroup({ label, items, prefix }: { label: string; items: string[]; prefix: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="text-subtle uppercase tracking-label text-[9px]">{label}</div>
      <div className="mt-0.5 space-y-0.5">
        {items.map(name => (
          <div key={name} className="text-text font-mono">{`{${prefix}${name}}`}</div>
        ))}
      </div>
    </div>
  );
}

function AnnotationsTab({ annotations, outputFields, onChange }: { annotations: Annotation[]; outputFields: string[]; onChange: (a: Annotation[]) => void }) {
  function set(i: number, patch: Partial<Annotation>) {
    onChange(annotations.map((a, idx) => idx === i ? { ...a, ...patch } : a));
  }
  return (
    <div className="p-4 space-y-2">
      <div className="text-[11px] font-mono text-subtle mb-2">
        Tell the model what each output field should contain. Helps the LLM produce reliable structured JSON.
      </div>
      {annotations.map((a, i) => (
        <div key={i} className="grid grid-cols-[140px_120px_1fr_30px] gap-2">
          <input className="input h-8 text-xs font-mono" placeholder="field name" value={a.field} onChange={(e) => set(i, { field: e.target.value })} />
          <select className="input h-8 text-xs" value={a.type} onChange={(e) => set(i, { type: e.target.value as any })}>
            <option value="auto">Auto</option>
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="boolean">Boolean</option>
            <option value="object">Object</option>
            <option value="array">Array</option>
          </select>
          <input className="input h-8 text-xs" placeholder="description for the model" value={a.description} onChange={(e) => set(i, { description: e.target.value })} />
          <button className="btn-ghost text-danger p-0.5" onClick={() => onChange(annotations.filter((_, idx) => idx !== i))}>
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button className="btn-ghost text-xs" onClick={() => onChange([...annotations, { field: '', type: 'auto', description: '' }])}>
        <Plus className="h-3 w-3" /> Annotation
      </button>
    </div>
  );
}

function AttachmentsTab({ attachments, onChange }: { attachments: Attachment[]; onChange: (a: Attachment[]) => void }) {
  return (
    <div className="p-4 space-y-2">
      <div className="text-[11px] font-mono text-subtle mb-2 flex items-center gap-1">
        <Paperclip className="h-3 w-3" />
        Reference docs the model can read. Use <code className="bg-muted px-1 rounded">{`{attachments.<filename>}`}</code> in prompts.
      </div>
      {attachments.map((a, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_30px] gap-2">
          <input className="input h-8 text-xs font-mono" placeholder="filename.pdf" value={a.filename} onChange={(e) => onChange(attachments.map((x, idx) => idx === i ? { ...x, filename: e.target.value } : x))} />
          <input className="input h-8 text-xs font-mono" placeholder="ref / URL / s3://…" value={a.ref} onChange={(e) => onChange(attachments.map((x, idx) => idx === i ? { ...x, ref: e.target.value } : x))} />
          <button className="btn-ghost text-danger p-0.5" onClick={() => onChange(attachments.filter((_, idx) => idx !== i))}>
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button className="btn-ghost text-xs" onClick={() => onChange([...attachments, { filename: '', ref: '' }])}>
        <Plus className="h-3 w-3" /> Attachment
      </button>
    </div>
  );
}
