'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ChevronRight, FolderKanban } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { projectsApi } from '@/lib/api';

export default function ProjectsPage() {
  const { tenant } = useParams<{ tenant: string }>();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  });

  return (
    <PageContent>
      <PageHeader
        title="Projects"
        description="Domain workspaces — each project owns its own rules, flows, and integrations"
        stats={[
          { label: 'Total', value: projects.length },
        ]}
        actions={
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" />
            New Project
          </button>
        }
      />

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/30 border-b border-border">
            <tr className="text-left">
              <th className="py-3 px-4 label-section w-12">#</th>
              <th className="py-3 px-4 label-section">Project</th>
              <th className="py-3 px-4 label-section text-right">Rules</th>
              <th className="py-3 px-4 label-section text-right">Flows</th>
              <th className="py-3 px-4 label-section w-12"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="text-center py-12 text-subtle font-mono text-sm">Loading…</td></tr>
            )}
            {!isLoading && projects.length === 0 && (
              <tr><td colSpan={5} className="text-center py-16">
                <FolderKanban className="h-10 w-10 mx-auto text-subtle/40 mb-2" />
                <div className="text-sm text-subtle">No projects yet — create your first one</div>
              </td></tr>
            )}
            {projects.map((p: any, i: number) => (
              <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className="py-3 px-4 row-index">{String(i + 1).padStart(2, '0')}</td>
                <td className="py-3 px-4">
                  <Link href={`/${tenant}/projects/${p.slug || p.id}/rules`} className="flex items-center gap-3 group">
                    <span className="h-8 w-8 rounded flex items-center justify-center" style={{ background: p.color ? `${p.color}33` : 'rgb(var(--c-mint) / 0.2)' }}>
                      <FolderKanban className="h-4 w-4 text-text" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium group-hover:text-accent">{p.name}</div>
                      <div className="text-xs text-subtle font-mono truncate">{p.description || p.slug}</div>
                    </div>
                  </Link>
                </td>
                <td className="py-3 px-4 text-right font-mono text-xs text-subtle tabular-nums">
                  {p._count?.rules ?? '—'}
                </td>
                <td className="py-3 px-4 text-right font-mono text-xs text-subtle tabular-nums">
                  {p._count?.flows ?? '—'}
                </td>
                <td className="py-3 px-4 text-right">
                  <Link href={`/${tenant}/projects/${p.slug || p.id}/rules`}>
                    <ChevronRight className="h-4 w-4 text-subtle inline" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && <CreateProjectDialog onClose={() => setShowCreate(false)} onCreated={() => qc.invalidateQueries({ queryKey: ['projects'] })} />}
    </PageContent>
  );
}

function CreateProjectDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => projectsApi.create({ name, description }),
    onSuccess: () => { onCreated(); onClose(); },
    onError: (e: any) => setError(e.message),
  });

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 z-50" onClick={onClose}>
      <div className="card w-full max-w-md p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold">New Project</h2>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
          <div>
            <label className="label-section block mb-1.5">Name</label>
            <input required className="input w-full" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
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
