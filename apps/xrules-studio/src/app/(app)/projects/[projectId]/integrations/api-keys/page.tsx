// API Keys moved into Integrate section. Re-export project-scoped variant.
'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, Trash2, Copy, Lock } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { EntityTable, Pill } from '@/components/EntityList';
import { apiKeysApi } from '@/lib/api';
import { useAuth } from '@/lib/store';

export default function ProjectApiKeysPage() {
  const ws = useAuth((s) => s.workspace);
  const wsSlug = ws?.slug || '';
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['api-keys', wsSlug],
    queryFn: () => apiKeysApi.list(wsSlug),
  });

  return (
    <PageContent>
      <PageHeader
        title="API Keys"
        description="Authenticate inbound calls to your published rule endpoints. Treat keys like passwords — they grant rule execution rights."
        stats={[{ label: 'Active', value: keys.length }]}
        actions={<button className="btn-primary" onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5" />New Key</button>}
      />

      {revealed && (
        <div className="card p-4 mb-4 border-warn/40 bg-warn/5">
          <div className="label-section text-warn mb-2">⚠ This is the only time you will see this key</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-sm bg-surface p-2 rounded break-all">{revealed}</code>
            <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(revealed)}><Copy className="h-3.5 w-3.5" /></button>
            <button className="btn-outline" onClick={() => setRevealed(null)}>Dismiss</button>
          </div>
        </div>
      )}

      <EntityTable
        rows={keys}
        isLoading={isLoading}
        emptyText="No API keys yet"
        emptyIcon={KeyRound}
        columns={[
          { header: 'Name', cell: (k: any) => <div><div className="text-sm font-medium">{k.name}</div><code className="text-xs text-subtle font-mono">{k.prefix}…</code></div> },
          { header: 'Scopes', cell: (k: any) => <div className="flex gap-1">{k.scopes.map((s: string) => <Pill key={s} tone="info">{s}</Pill>)}</div> },
          { header: 'Last used', cell: (k: any) => <span className="font-mono text-xs text-subtle">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'never'}</span> },
          {
            header: '', align: 'right',
            cell: (k: any) => (
              <button className="btn-ghost text-danger" onClick={async () => {
                if (confirm(`Revoke key "${k.name}"?`)) {
                  await apiKeysApi.remove(k.id);
                  qc.invalidateQueries({ queryKey: ['api-keys', wsSlug] });
                }
              }}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ),
          },
        ]}
      />

      {showCreate && (
        <CreateDialog
          onClose={() => setShowCreate(false)}
          onCreated={(secret) => {
            setRevealed(secret);
            qc.invalidateQueries({ queryKey: ['api-keys', wsSlug] });
          }}
        />
      )}
    </PageContent>
  );
}

function CreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (secret: string) => void }) {
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['execute']);
  const mut = useMutation({
    mutationFn: () => apiKeysApi.create({ name, scopes }),
    onSuccess: (res: any) => { onCreated(res.key || res.secret); onClose(); },
  });
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 z-50" onClick={onClose}>
      <div className="card w-full max-w-md p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold flex items-center gap-2"><Lock className="h-4 w-4" />New API Key</h2>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
          <div>
            <label className="label-section block mb-1.5">Name</label>
            <input required className="input w-full" placeholder="e.g. backend-prod" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label-section block mb-1.5">Scopes</label>
            <div className="flex gap-2">
              {['execute', 'read', 'admin'].map((s) => (
                <label key={s} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="checkbox" checked={scopes.includes(s)} onChange={(e) => {
                    setScopes(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s));
                  }} />
                  <span className="font-mono text-xs uppercase tracking-label">{s}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={mut.isPending} className="btn-primary disabled:opacity-50">{mut.isPending ? 'Creating…' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
