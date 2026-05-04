'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plug, Plus, Trash2, Lock } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { EntityTable, Pill } from '@/components/EntityList';
import { connectionsApi, api } from '@/lib/api';

type ConnType = 'HTTP' | 'POSTGRES' | 'MYSQL' | 'REDIS' | 'KAFKA' | 'S3';

const TYPE_TONE: Record<ConnType, any> = {
  HTTP:     'info',
  POSTGRES: 'mint',
  MYSQL:    'mint',
  REDIS:    'danger',
  KAFKA:    'warn',
  S3:       'subtle',
};

export default function ConnectionsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['connections', projectId],
    queryFn: () => connectionsApi.list(projectId),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del<void>(`/connections/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections', projectId] }),
  });

  return (
    <PageContent>
      <PageHeader
        title="Connections"
        description="Encrypted credentials referenced by Flow nodes. Secrets never leave the server in plain text."
        stats={[{ label: 'Total', value: rows.length }]}
        actions={<button className="btn-primary" onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5" />New Connection</button>}
      />
      <EntityTable
        rows={rows}
        isLoading={isLoading}
        emptyText="No connections yet — add HTTP/DB/Kafka credentials to use in flows"
        emptyIcon={Plug}
        columns={[
          {
            header: 'Connection',
            cell: (c: any) => (
              <div className="flex items-center gap-2">
                <Lock className="h-3 w-3 text-subtle" />
                <div>
                  <div className="text-sm font-medium">{c.name}</div>
                  <div className="text-xs text-subtle font-mono">{c.slug}</div>
                </div>
              </div>
            ),
          },
          { header: 'Type',  cell: (c: any) => <Pill tone={TYPE_TONE[c.type?.toUpperCase() as ConnType] || 'subtle'}>{c.type?.toUpperCase()}</Pill> },
          {
            header: 'Host',
            cell: (c: any) => (
              <span className="font-mono text-xs text-subtle truncate max-w-[280px] inline-block">
                {c.meta?.baseUrl || c.meta?.host || c.meta?.bootstrap || c.meta?.bucket || c.meta?.url || '—'}
                {c.meta?.port ? `:${c.meta.port}` : ''}
              </span>
            ),
          },
          {
            header: '',
            align: 'right',
            cell: (c: any) => (
              <button
                className="btn-ghost text-danger"
                onClick={(e) => { e.stopPropagation(); if (confirm(`Delete connection "${c.name}"? Flows using it will break.`)) remove.mutate(c.id); }}
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
          onCreated={() => qc.invalidateQueries({ queryKey: ['connections', projectId] })}
        />
      )}
    </PageContent>
  );
}

interface FieldSpec {
  key: string;
  label: string;
  secret?: boolean;
  meta?: boolean;       // goes into meta (plaintext) instead of config (encrypted)
  placeholder?: string;
  type?: 'text' | 'number' | 'password';
}

const FIELDS: Record<ConnType, FieldSpec[]> = {
  HTTP: [
    { key: 'baseUrl',   label: 'Base URL',          meta: true, placeholder: 'https://api.example.com' },
    { key: 'authToken', label: 'Auth token',        secret: true, type: 'password', placeholder: 'Bearer …' },
    { key: 'authType',  label: 'Auth type',         meta: true, placeholder: 'bearer | basic | none' },
  ],
  POSTGRES: [
    { key: 'host',     label: 'Host',     meta: true, placeholder: 'db.internal' },
    { key: 'port',     label: 'Port',     meta: true, type: 'number', placeholder: '5432' },
    { key: 'database', label: 'Database', meta: true, placeholder: 'app' },
    { key: 'user',     label: 'User',     meta: true, placeholder: 'app_ro' },
    { key: 'password', label: 'Password', secret: true, type: 'password' },
    { key: 'sslmode',  label: 'SSL mode', meta: true, placeholder: 'require' },
  ],
  MYSQL: [
    { key: 'host',     label: 'Host',     meta: true, placeholder: 'db.internal' },
    { key: 'port',     label: 'Port',     meta: true, type: 'number', placeholder: '3306' },
    { key: 'database', label: 'Database', meta: true },
    { key: 'user',     label: 'User',     meta: true },
    { key: 'password', label: 'Password', secret: true, type: 'password' },
  ],
  REDIS: [
    { key: 'host',     label: 'Host',     meta: true, placeholder: 'redis.internal' },
    { key: 'port',     label: 'Port',     meta: true, type: 'number', placeholder: '6379' },
    { key: 'password', label: 'Password', secret: true, type: 'password' },
    { key: 'db',       label: 'DB index', meta: true, type: 'number', placeholder: '0' },
  ],
  KAFKA: [
    { key: 'bootstrap', label: 'Bootstrap servers', meta: true, placeholder: 'broker1:9092,broker2:9092' },
    { key: 'username',  label: 'SASL username',     meta: true },
    { key: 'password',  label: 'SASL password',     secret: true, type: 'password' },
  ],
  S3: [
    { key: 'region',          label: 'Region',     meta: true, placeholder: 'us-east-1' },
    { key: 'bucket',          label: 'Bucket',     meta: true },
    { key: 'accessKeyId',     label: 'Access key', secret: true },
    { key: 'secretAccessKey', label: 'Secret key', secret: true, type: 'password' },
    { key: 'endpoint',        label: 'Endpoint (optional)', meta: true, placeholder: 'https://s3.example.com' },
  ],
};

function CreateDialog({ projectId, onClose, onCreated }: { projectId: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<ConnType>('HTTP');
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const fields = FIELDS[type];

  const mut = useMutation({
    mutationFn: () => {
      const config: Record<string, any> = {};
      const meta: Record<string, any> = {};
      for (const f of fields) {
        const v = values[f.key];
        if (v === undefined || v === '') continue;
        const coerced = f.type === 'number' ? Number(v) : v;
        if (f.meta) meta[f.key] = coerced;
        else config[f.key] = coerced;
      }
      return connectionsApi.create({ projectId, name, type, config, meta });
    },
    onSuccess: () => { onCreated(); onClose(); },
    onError: (e: any) => setError(e.message),
  });

  function setVal(k: string, v: string) {
    setValues((p) => ({ ...p, [k]: v }));
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 z-50" onClick={onClose}>
      <div className="card w-full max-w-lg p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold">New Connection</h2>
        <p className="text-xs text-subtle font-mono flex items-center gap-1.5">
          <Lock className="h-3 w-3" />
          Secret fields are AES-256-GCM encrypted server-side and never returned to the UI.
        </p>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-section block mb-1.5">Name</label>
              <input required className="input w-full" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="label-section block mb-1.5">Type</label>
              <select className="input w-full" value={type} onChange={(e) => { setType(e.target.value as ConnType); setValues({}); }}>
                <option>HTTP</option>
                <option>POSTGRES</option>
                <option>MYSQL</option>
                <option>REDIS</option>
                <option>KAFKA</option>
                <option>S3</option>
              </select>
            </div>
          </div>

          <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
            {fields.map((f) => (
              <div key={f.key}>
                <label className="label-section block mb-1.5 flex items-center gap-1.5">
                  {f.label}
                  {f.secret && <Lock className="h-2.5 w-2.5 text-warn" />}
                </label>
                <input
                  className="input w-full"
                  type={f.type || 'text'}
                  placeholder={f.placeholder}
                  value={values[f.key] || ''}
                  onChange={(e) => setVal(f.key, e.target.value)}
                />
              </div>
            ))}
          </div>

          {error && <div className="pill pill-danger">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={mut.isPending} className="btn-primary disabled:opacity-50">
              {mut.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
