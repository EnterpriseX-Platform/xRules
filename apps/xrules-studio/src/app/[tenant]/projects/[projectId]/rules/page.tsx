'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ChevronRight, FileText, Search } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { StatusPill, Pill } from '@/components/ui/Pill';
import { rulesApi } from '@/lib/api';

const TYPE_TONE: Record<string, any> = {
  DECISION_TABLE: 'info',
  DECISION_TREE: 'mint',
  FORMULA: 'warn',
  SCRIPT: 'subtle',
  LOOKUP: 'subtle',
  MODEL_CALL: 'danger',
};

export default function RulesPage() {
  const { tenant, projectId } = useParams<{ tenant: string; projectId: string }>();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['rules', projectId, filter],
    queryFn: () => rulesApi.list(projectId, filter === 'all' ? undefined : filter),
  });

  const filtered = rules.filter((r: any) =>
    !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.slug.includes(search.toLowerCase()),
  );

  const stats = {
    published: rules.filter((r: any) => r.status === 'published').length,
    draft:     rules.filter((r: any) => r.status === 'draft').length,
    total:     rules.length,
  };

  return (
    <PageContent>
      <PageHeader
        title="Rules"
        description="Atomic decision units — decision tables, trees, formulas, scripts"
        stats={[
          { label: 'Published', value: stats.published },
          { label: 'Draft',     value: stats.draft },
          { label: 'Total',     value: stats.total },
        ]}
        actions={
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" />
            New Rule
          </button>
        }
      />

      <div className="flex items-center gap-3 mb-4">
        <div className="tabs-row">
          {['all', 'published', 'draft', 'archived'].map((t) => (
            <button key={t} className={`tab ${filter === t ? 'tab-active' : ''}`} onClick={() => setFilter(t)}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-subtle" />
          <input
            className="input w-full pl-9"
            placeholder="search rules…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/30 border-b border-border">
            <tr className="text-left">
              <th className="py-3 px-4 label-section w-12">#</th>
              <th className="py-3 px-4 label-section">Rule</th>
              <th className="py-3 px-4 label-section">Type</th>
              <th className="py-3 px-4 label-section">Status</th>
              <th className="py-3 px-4 label-section text-right">Version</th>
              <th className="py-3 px-4 label-section w-12"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="text-center py-12 text-subtle font-mono text-sm">Loading…</td></tr>}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center py-16">
                <FileText className="h-10 w-10 mx-auto text-subtle/40 mb-2" />
                <div className="text-sm text-subtle">No rules — create your first one</div>
              </td></tr>
            )}
            {filtered.map((r: any, i: number) => (
              <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className="py-3 px-4 row-index">{String(i + 1).padStart(2, '0')}</td>
                <td className="py-3 px-4">
                  <Link href={`/${tenant}/projects/${projectId}/rules/${r.id}`} className="block group">
                    <div className="text-sm font-medium group-hover:text-accent">{r.name}</div>
                    <div className="text-xs text-subtle font-mono">{r.slug}</div>
                  </Link>
                </td>
                <td className="py-3 px-4">
                  <Pill tone={TYPE_TONE[r.type] || 'subtle'}>{r.type.replace('_', ' ')}</Pill>
                </td>
                <td className="py-3 px-4"><StatusPill status={r.status} /></td>
                <td className="py-3 px-4 text-right font-mono text-xs text-subtle tabular-nums">v{r.version}</td>
                <td className="py-3 px-4 text-right">
                  <Link href={`/${tenant}/projects/${projectId}/rules/${r.id}`}>
                    <ChevronRight className="h-4 w-4 text-subtle inline" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateRuleDialog
          projectId={projectId}
          onClose={() => setShowCreate(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['rules', projectId] })}
        />
      )}
    </PageContent>
  );
}

function CreateRuleDialog({ projectId, onClose, onCreated }: { projectId: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('DECISION_TABLE');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => rulesApi.create({ name, type, description, projectId }),
    onSuccess: () => { onCreated(); onClose(); },
    onError: (e: any) => setError(e.message),
  });

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 z-50" onClick={onClose}>
      <div className="card w-full max-w-md p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold">New Rule</h2>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
          <div>
            <label className="label-section block mb-1.5">Name</label>
            <input required className="input w-full" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label-section block mb-1.5">Type</label>
            <select className="input w-full" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="DECISION_TABLE">Decision Table</option>
              <option value="DECISION_TREE">Decision Tree</option>
              <option value="FORMULA">Formula</option>
              <option value="SCRIPT">Script</option>
              <option value="LOOKUP">Lookup</option>
              <option value="MODEL_CALL">Model Call</option>
            </select>
          </div>
          <div>
            <label className="label-section block mb-1.5">Description</label>
            <textarea className="input w-full h-20 py-2" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {error && <div className="pill pill-danger">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={mut.isPending} className="btn-primary disabled:opacity-50">
              {mut.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
