'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Webhook, Plus, Trash2, Copy, Lock } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { EntityTable, Pill } from '@/components/EntityList';
import { api } from '@/lib/api';

const EVENTS = [
  { id: 'execute.success',   label: 'Execute → success' },
  { id: 'execute.error',     label: 'Execute → error' },
  { id: 'rule.published',    label: 'Rule published' },
  { id: 'rule.archived',     label: 'Rule archived' },
  { id: 'job.completed',     label: 'Job completed' },
  { id: 'job.failed',        label: 'Job failed' },
];

export default function WebhooksPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  const { data: hooks = [], isLoading } = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => api.get<any[]>('/webhooks'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del<void>(`/webhooks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });

  return (
    <PageContent>
      <PageHeader
        title="Webhooks"
        description="HMAC-SHA256 signed callbacks delivered when chosen events occur. Retried with exponential backoff up to 5 times."
        stats={[{ label: 'Active', value: hooks.filter((h: any) => h.active).length }, { label: 'Total', value: hooks.length }]}
        actions={<button className="btn-primary" onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5" />New Webhook</button>}
      />

      {revealedSecret && (
        <div className="card p-4 mb-4 border-warn/40 bg-warn/5">
          <div className="label-section text-warn mb-2 flex items-center gap-1.5"><Lock className="h-3 w-3" />Save this secret — it's shown only once</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-sm bg-surface p-2 rounded break-all">{revealedSecret}</code>
            <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(revealedSecret)}><Copy className="h-3.5 w-3.5" /></button>
            <button className="btn-outline" onClick={() => setRevealedSecret(null)}>Dismiss</button>
          </div>
        </div>
      )}

      <EntityTable
        rows={hooks}
        isLoading={isLoading}
        emptyText="No webhooks yet"
        emptyIcon={Webhook}
        columns={[
          { header: 'Webhook', cell: (h: any) => (
            <div>
              <div className="text-sm font-medium">{h.name}</div>
              <code className="text-[11px] font-mono text-subtle truncate max-w-[280px] inline-block">{h.url}</code>
            </div>
          ) },
          { header: 'Events', cell: (h: any) => <div className="flex gap-1 flex-wrap">
            {(h.events || []).slice(0, 3).map((e: string) => <Pill key={e} tone="info">{e}</Pill>)}
            {h.events?.length > 3 && <span className="text-[11px] text-subtle font-mono">+{h.events.length - 3}</span>}
          </div> },
          { header: 'Status', cell: (h: any) => h.active ? <Pill tone="ok" dot>active</Pill> : <Pill tone="subtle" dot>paused</Pill> },
          {
            header: '', align: 'right',
            cell: (h: any) => (
              <button className="btn-ghost text-danger" onClick={() => {
                if (confirm(`Delete webhook "${h.name}"?`)) remove.mutate(h.id);
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
            setRevealedSecret(secret);
            qc.invalidateQueries({ queryKey: ['webhooks'] });
          }}
        />
      )}
    </PageContent>
  );
}

function CreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (secret: string) => void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('https://');
  const [events, setEvents] = useState<string[]>(['execute.success', 'execute.error']);
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => api.post<any>('/webhooks', { name, url, events, active: true }),
    onSuccess: (res: any) => {
      onCreated(res.secret);
      onClose();
    },
    onError: (e: any) => setError(e.message),
  });

  function toggle(id: string) {
    setEvents(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 z-50" onClick={onClose}>
      <div className="card w-full max-w-lg p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold">New Webhook</h2>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
          <div>
            <label className="label-section block mb-1.5">Name</label>
            <input required className="input w-full" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label-section block mb-1.5">Endpoint URL</label>
            <input required type="url" className="input w-full font-mono text-xs" placeholder="https://example.com/webhooks/xrules" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div>
            <label className="label-section block mb-1.5">Events ({events.length})</label>
            <div className="border border-border rounded p-2 space-y-1">
              {EVENTS.map(e => (
                <label key={e.id} className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer hover:bg-muted/40 rounded">
                  <input type="checkbox" checked={events.includes(e.id)} onChange={() => toggle(e.id)} />
                  <span className="font-mono text-xs">{e.id}</span>
                  <span className="text-subtle text-xs ml-auto">{e.label}</span>
                </label>
              ))}
            </div>
          </div>
          {error && <div className="pill pill-danger">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={mut.isPending || !events.length} className="btn-primary disabled:opacity-50">
              {mut.isPending ? 'Creating…' : 'Create webhook'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
