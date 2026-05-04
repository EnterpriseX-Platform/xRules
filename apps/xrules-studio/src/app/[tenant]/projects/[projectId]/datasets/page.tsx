'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, Plus, Trash2 } from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { EntityTable, Pill } from '@/components/EntityList';
import { datasetsApi, api } from '@/lib/api';

export default function DatasetsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['datasets', projectId],
    queryFn: () => datasetsApi.list(projectId),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del<void>(`/datasets/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['datasets', projectId] }),
  });

  return (
    <PageContent>
      <PageHeader
        title="Datasets"
        description="Sample data for batch testing and replay simulations — JSONL or CSV"
        stats={[{ label: 'Total', value: rows.length }]}
        actions={<button className="btn-primary" onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5" />Upload Dataset</button>}
      />
      <EntityTable
        rows={rows}
        isLoading={isLoading}
        emptyText="No datasets yet — upload one to enable batch testing & replay"
        emptyIcon={Database}
        columns={[
          {
            header: 'Dataset',
            cell: (d: any) => (
              <div>
                <div className="text-sm font-medium">{d.name}</div>
                <div className="text-xs text-subtle font-mono">{d.slug}</div>
              </div>
            ),
          },
          { header: 'Format', cell: (d: any) => <Pill tone="subtle">{d.format}</Pill> },
          { header: 'Source', cell: (d: any) => <span className="font-mono text-[11px] text-subtle">{d.uri || (d.inline ? 'inline' : '—')}</span> },
          { header: 'Rows',   cell: (d: any) => <span className="font-mono text-xs text-subtle tabular-nums">{d.rowCount}</span>, align: 'right' },
          {
            header: '', align: 'right',
            cell: (d: any) => (
              <button
                className="btn-ghost text-danger"
                onClick={(e) => { e.stopPropagation(); if (confirm(`Delete dataset "${d.name}"?`)) remove.mutate(d.id); }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ),
          },
        ]}
      />
      {showCreate && (
        <UploadDialog
          projectId={projectId}
          onClose={() => setShowCreate(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['datasets', projectId] })}
        />
      )}
    </PageContent>
  );
}

function UploadDialog({ projectId, onClose, onCreated }: { projectId: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [format, setFormat] = useState<'jsonl' | 'csv' | 'json'>('jsonl');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => {
      const inline = parseInline(text, format);
      if (!Array.isArray(inline)) throw new Error('Could not parse content as ' + format.toUpperCase());
      return datasetsApi.create({ projectId, name, format, inline });
    },
    onSuccess: () => { onCreated(); onClose(); },
    onError: (e: any) => setError(e.message),
  });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''));
    const ext = f.name.toLowerCase().split('.').pop();
    if (ext === 'csv') setFormat('csv');
    else if (ext === 'json') setFormat('json');
    else setFormat('jsonl');
    setText(await f.text());
  }

  const previewRows = (() => {
    try { return parseInline(text, format)?.length || 0; } catch { return 0; }
  })();

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 z-50" onClick={onClose}>
      <div className="card w-full max-w-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold">Upload Dataset</h2>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-section block mb-1.5">Name</label>
              <input required className="input w-full" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="label-section block mb-1.5">Format</label>
              <select className="input w-full" value={format} onChange={(e) => setFormat(e.target.value as any)}>
                <option value="jsonl">JSONL (one JSON per line)</option>
                <option value="json">JSON (array)</option>
                <option value="csv">CSV (with header row)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label-section block mb-1.5">Pick a file (optional)</label>
            <input type="file" accept=".jsonl,.json,.csv,.txt" className="text-xs" onChange={onFile} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label-section">Content</label>
              <span className="font-mono text-[10px] text-subtle">{previewRows} rows parsed</span>
            </div>
            <textarea
              required
              className="input w-full h-56 py-2 font-mono text-xs"
              placeholder={
                format === 'jsonl' ? '{"customerTier":"platinum","orderAmount":1500}\n{"customerTier":"gold","orderAmount":600}' :
                format === 'json'  ? '[{"customerTier":"platinum","orderAmount":1500}]' :
                                     'customerTier,orderAmount\nplatinum,1500\ngold,600'
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          {error && <div className="pill pill-danger">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={mut.isPending || !previewRows} className="btn-primary disabled:opacity-50">
              {mut.isPending ? 'Uploading…' : `Upload (${previewRows} rows)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Parse JSONL / JSON / CSV text into an array of row objects.
// Returns null on unrecoverable parse error.
function parseInline(text: string, format: string): any[] | null {
  const t = text.trim();
  if (!t) return [];
  try {
    if (format === 'json') {
      const v = JSON.parse(t);
      return Array.isArray(v) ? v : [v];
    }
    if (format === 'jsonl') {
      return t.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    }
    if (format === 'csv') {
      const lines = t.split(/\r?\n/).filter(Boolean);
      if (!lines.length) return [];
      const header = parseCsvLine(lines[0]);
      return lines.slice(1).map((line) => {
        const cells = parseCsvLine(line);
        const obj: Record<string, any> = {};
        header.forEach((h, i) => {
          const v = cells[i];
          if (v === undefined) { obj[h] = null; return; }
          if (/^-?\d+(\.\d+)?$/.test(v)) obj[h] = Number(v);
          else if (v === 'true' || v === 'false') obj[h] = v === 'true';
          else obj[h] = v;
        });
        return obj;
      });
    }
  } catch {
    return null;
  }
  return null;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (c === ',' && !inQuote) {
      out.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}
