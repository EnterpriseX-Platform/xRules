'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Brain, Plus, Trash2 } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { EntityTable, StatusPill, Pill } from '@/components/EntityList';
import { api } from '@/lib/api';

const MODEL_TONE: Record<string, any> = { ML: 'info', LLM: 'warn', PMML: 'mint' };

export default function ModelsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['models', projectId],
    queryFn: () => api.get<any[]>(`/models?project_id=${projectId}`),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del<void>(`/models/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['models', projectId] }),
  });

  return (
    <PageContent>
      <PageHeader
        title="Models"
        description="ML / LLM / PMML artifacts referenced by rules of type MODEL_CALL"
        stats={[{ label: 'Total', value: rows.length }]}
        actions={<button className="btn-primary" onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5" />New Model</button>}
      />
      <EntityTable
        rows={rows}
        isLoading={isLoading}
        emptyText="No models yet"
        emptyIcon={Brain}
        emptyBody="Register an ML or PMML artifact, then call it from a Rule of type MODEL_CALL."
        emptyCta={<button className="btn-primary text-sm" onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5" />Register a model</button>}
        columns={[
          {
            header: 'Model',
            cell: (m: any) => (
              <div>
                <div className="text-sm font-medium">{m.name}</div>
                <div className="text-xs text-subtle font-mono">{m.slug}</div>
              </div>
            ),
          },
          { header: 'Type',    cell: (m: any) => <Pill tone={MODEL_TONE[m.type?.toUpperCase()] || 'subtle'}>{m.type?.toUpperCase()}</Pill> },
          { header: 'Status',  cell: (m: any) => <StatusPill status={m.status} /> },
          { header: 'Version', cell: (m: any) => <span className="font-mono text-xs text-subtle tabular-nums">{m.version}</span>, align: 'right' },
          {
            header: '', align: 'right',
            cell: (m: any) => (
              <button
                className="btn-ghost text-danger"
                onClick={(e) => { e.stopPropagation(); if (confirm(`Delete model "${m.name}"?`)) remove.mutate(m.id); }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ),
          },
        ]}
      />
      {showCreate && (
        <CreateModelDialog
          projectId={projectId}
          onClose={() => setShowCreate(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['models', projectId] })}
        />
      )}
    </PageContent>
  );
}

function CreateModelDialog({ projectId, onClose, onCreated }: { projectId: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('ML');
  const [version, setVersion] = useState('1.0.0');
  const [artifactUri, setArtifactUri] = useState('');
  const [configText, setConfigText] = useState('{}');
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => {
      let config: any = {};
      try { config = JSON.parse(configText || '{}'); } catch { throw new Error('Config must be valid JSON'); }
      return api.post('/models', { projectId, name, type, version, artifactUri: artifactUri || undefined, config });
    },
    onSuccess: () => { onCreated(); onClose(); },
    onError: (e: any) => setError(e.message),
  });

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 z-50" onClick={onClose}>
      <div className="card w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold">New Model</h2>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
          <div>
            <label className="label-section block mb-1.5">Name</label>
            <input required className="input w-full" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-section block mb-1.5">Type</label>
              <select className="input w-full" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="ML">ML (scikit / XGBoost)</option>
                <option value="LLM">LLM (prompt template)</option>
                <option value="PMML">PMML</option>
              </select>
            </div>
            <div>
              <label className="label-section block mb-1.5">Version</label>
              <input className="input w-full font-mono" value={version} onChange={(e) => setVersion(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label-section block mb-1.5">Artifact URI (optional)</label>
            <input className="input w-full font-mono text-xs" placeholder="s3://bucket/model.pkl  •  file:///path/model.pmml" value={artifactUri} onChange={(e) => setArtifactUri(e.target.value)} />
          </div>
          <div>
            <label className="label-section block mb-1.5">Config (JSON)</label>
            <textarea className="input w-full h-24 py-2 font-mono text-xs" value={configText} onChange={(e) => setConfigText(e.target.value)} />
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
