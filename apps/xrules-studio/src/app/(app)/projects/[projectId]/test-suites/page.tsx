'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Plus, Play, Trash2 } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { TestNav } from '@/components/layout/TestNav';
import { EntityTable, Pill } from '@/components/EntityList';
import { testSuitesApi, datasetsApi, rulesApi, api } from '@/lib/api';

export default function TestSuitesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: suites = [], isLoading } = useQuery({
    queryKey: ['test-suites', projectId],
    queryFn: () => testSuitesApi.list(projectId),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del<void>(`/test-suites/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['test-suites', projectId] }),
  });

  return (
    <PageContent>
      <PageHeader
        title="Test"
        description="Validate rules before they ship — assertion suites, sample data, version diff and replay, and latency benchmarks"
        stats={[{ label: 'Suites', value: suites.length }]}
        actions={<button className="btn-primary" onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5" />New Suite</button>}
      />
      <TestNav />
      <EntityTable
        rows={suites}
        isLoading={isLoading}
        emptyText="No test suites yet"
        emptyIcon={FlaskConical}
        emptyBody="A test suite binds a rule (or several) to a dataset and runs every input row, producing pass/fail/error per result. Catch regressions before publishing."
        emptyCta={<button className="btn-primary text-sm" onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5" />Create your first suite</button>}
        columns={[
          {
            header: 'Suite',
            cell: (s: any) => (
              <div>
                <div className="text-sm font-medium">{s.name}</div>
                <div className="text-xs text-subtle font-mono">{s.slug}</div>
                {s.description && <div className="text-xs text-subtle mt-0.5 max-w-[400px] truncate">{s.description}</div>}
              </div>
            ),
          },
          { header: 'Rules', cell: (s: any) => <Pill tone="info">{s.rules?.length ?? 0} rules</Pill> },
          {
            header: '',
            align: 'right',
            cell: (s: any) => <RunButton suiteId={s.id} projectId={projectId} />,
          },
          {
            header: '',
            align: 'right',
            cell: (s: any) => (
              <button
                className="btn-ghost text-danger"
                onClick={(e) => { e.stopPropagation(); if (confirm(`Delete suite "${s.name}"?`)) remove.mutate(s.id); }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ),
          },
        ]}
      />
      {showCreate && (
        <CreateDialog
          projectId={projectId}
          onClose={() => setShowCreate(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['test-suites', projectId] })}
        />
      )}
    </PageContent>
  );
}

function RunButton({ suiteId, projectId }: { suiteId: string; projectId: string }) {
  const { data: datasets = [] } = useQuery({
    queryKey: ['datasets', projectId],
    queryFn: () => datasetsApi.list(projectId),
  });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    if (!datasets.length) {
      alert('Upload a dataset under this project first.');
      return;
    }
    const ds = datasets[0];
    setRunning(true); setResult(null);
    try {
      const r = await testSuitesApi.run(suiteId, ds.id);
      setResult(`${r.totalRows} rows queued (${ds.name})`);
      setTimeout(() => setResult(null), 4000);
    } catch (e: any) {
      setResult('failed: ' + e.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {result && <span className="font-mono text-[10px] text-subtle">{result}</span>}
      <button className="btn-ghost text-xs" onClick={(e) => { e.stopPropagation(); run(); }} disabled={running}>
        <Play className="h-3 w-3" />
        {running ? 'Running…' : 'Run'}
      </button>
    </div>
  );
}

function CreateDialog({ projectId, onClose, onCreated }: { projectId: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { data: rules = [] } = useQuery({
    queryKey: ['rules', projectId, 'all'],
    queryFn: () => rulesApi.list(projectId),
  });

  const mut = useMutation({
    mutationFn: () => testSuitesApi.create({
      projectId, name, description: description || undefined,
      ruleIds: selected.map((id) => ({ ruleId: id })),
    }),
    onSuccess: () => { onCreated(); onClose(); },
    onError: (e: any) => setError(e.message),
  });

  function toggle(id: string) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 z-50" onClick={onClose}>
      <div className="card w-full max-w-lg p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold">New Test Suite</h2>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
          <div>
            <label className="label-section block mb-1.5">Name</label>
            <input required className="input w-full" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label-section block mb-1.5">Description</label>
            <textarea className="input w-full h-16 py-2" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="label-section block mb-1.5">Rules to include ({selected.length})</label>
            {rules.length === 0 ? (
              <div className="text-xs text-subtle font-mono">No rules in this project. Create one first.</div>
            ) : (
              <div className="border border-border rounded max-h-56 overflow-y-auto">
                {rules.map((r: any) => (
                  <label key={r.id} className="flex items-center gap-2 px-3 py-2 border-b border-border/50 last:border-0 cursor-pointer hover:bg-muted/40">
                    <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} />
                    <span className="text-sm">{r.name}</span>
                    <span className="font-mono text-[10px] text-subtle ml-auto">{r.slug} · v{r.version}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          {error && <div className="pill pill-danger">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={mut.isPending || !selected.length} className="btn-primary disabled:opacity-50">
              {mut.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
