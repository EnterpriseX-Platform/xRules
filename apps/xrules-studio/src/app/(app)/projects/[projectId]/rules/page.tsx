'use client';

import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, ChevronRight, FileText, Search, FolderTree, Folder, FolderPlus,
  Table, Network, BarChart3, Sigma, Code2, BookMarked, Bot, Brain, Sparkles,
} from 'lucide-react';
import { PageContent, PageHeader } from '@/components/layout/AppShell';
import { StatusPill, Pill } from '@/components/ui/Pill';
import { rulesApi, api } from '@/lib/api';
import { NewRuleDialog } from '@/components/rule/NewRuleDialog';

const TYPE_TONE: Record<string, any> = {
  DECISION_TABLE: 'info',
  DECISION_TREE: 'mint',
  SCORECARD: 'mint',
  FORMULA: 'warn',
  SCRIPT: 'subtle',
  LOOKUP: 'subtle',
  MODEL_CALL: 'danger',
  AI_AGENT: 'info',
};

const TYPE_ICON: Record<string, any> = {
  DECISION_TABLE: Table,
  DECISION_TREE:  Network,
  SCORECARD:      BarChart3,
  FORMULA:        Sigma,
  SCRIPT:         Code2,
  LOOKUP:         BookMarked,
  AI_AGENT:       Bot,
  MODEL_CALL:     Brain,
};

// Static class map — Tailwind needs concrete classes for JIT.
const TYPE_ICON_CLS: Record<string, string> = {
  info:    'bg-info/10 border-info/30 text-info',
  mint:    'bg-mint/10 border-mint/30 text-mint',
  warn:    'bg-warn/10 border-warn/30 text-warn',
  danger:  'bg-danger/10 border-danger/30 text-danger',
  subtle:  'bg-muted border-border text-text',
};

export default function RulesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const typeFilter = sp.get('type') || '';
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(null);

  // Open NewRuleDialog when URL has ?new=1 (from Topbar +New Rule shortcut).
  useEffect(() => {
    if (sp.get('new') === '1') {
      setShowCreate(true);
      const url = new URL(window.location.href);
      url.searchParams.delete('new');
      router.replace(url.pathname + url.search);
    }
  }, [sp, router]);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['rules', projectId, filter],
    queryFn: () => rulesApi.list(projectId, filter === 'all' ? undefined : filter),
  });
  const { data: folders = [] } = useQuery({
    queryKey: ['folders', projectId],
    queryFn: () => api.get<any[]>(`/folders?project_id=${projectId}`),
  });

  const filtered = rules.filter((r: any) =>
    (!search || r.name.toLowerCase().includes(search.toLowerCase()) || r.slug.includes(search.toLowerCase()))
    && (!typeFilter || String(r.type || '').toUpperCase() === typeFilter)
    && (folderId === null || r.folderId === folderId),
  );

  const stats = {
    published: rules.filter((r: any) => r.status === 'published').length,
    draft:     rules.filter((r: any) => r.status === 'draft').length,
    total:     rules.length,
  };

  return (
    <PageContent>
      <PageHeader
        title={typeFilter ? typeFilter.replace('_', ' ').replace(/\b\w/g, m => m.toUpperCase()) + 's' : 'Rules'}
        description={typeFilter ? 'Filtered by rule kind' : 'Atomic decision units — decision tables, trees, formulas, scripts'}
        stats={[
          { label: 'Published', value: stats.published },
          { label: 'Draft',     value: stats.draft },
          { label: 'Total',     value: stats.total },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/projects/${projectId}/templates`}
              className="btn-outline"
              title="Browse pre-built starter rules"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Templates
            </Link>
            <Link
              href={`/projects/${projectId}/drd`}
              className="btn-ghost"
              title="Decision Requirements Diagram — visualize rule dependencies"
            >
              <Network className="h-3.5 w-3.5" />
              Graph
            </Link>
            <button className="btn-primary" onClick={() => setShowCreate(true)}>
              <Plus className="h-3.5 w-3.5" />
              New Rule
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-[220px_1fr] gap-3">
        {/* Folder tree */}
        <div className="card p-2">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="label-section flex items-center gap-1.5"><FolderTree className="h-3 w-3" />Folders</span>
            <button className="btn-ghost p-0 text-xs" onClick={async () => {
              const name = prompt('Folder name');
              if (!name) return;
              await api.post('/folders', { projectId, name });
              qc.invalidateQueries({ queryKey: ['folders', projectId] });
            }} title="New folder"><FolderPlus className="h-3 w-3" /></button>
          </div>
          <button
            className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted/50 ${folderId === null ? 'bg-muted text-text' : 'text-subtle'}`}
            onClick={() => setFolderId(null)}
          >
            <FileText className="h-3 w-3 inline mr-1.5" />All rules ({rules.length})
          </button>
          <FolderTreeView folders={folders} folderId={folderId} setFolderId={setFolderId} depth={0} parentId={null} />
        </div>

        {/* Main */}
        <div>
          {/* Type filter chips — always visible regardless of ?type= URL param */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="label-section mr-1">Type</span>
            <TypeChip current={typeFilter} value="" projectId={projectId}>All</TypeChip>
            <TypeChip current={typeFilter} value="DECISION_TABLE" projectId={projectId} tone="info">Decision Table</TypeChip>
            <TypeChip current={typeFilter} value="DECISION_TREE"  projectId={projectId} tone="mint">Decision Tree</TypeChip>
            <TypeChip current={typeFilter} value="SCORECARD"      projectId={projectId} tone="accent">Scorecard</TypeChip>
            <TypeChip current={typeFilter} value="FORMULA"        projectId={projectId} tone="warn">Formula</TypeChip>
            <TypeChip current={typeFilter} value="SCRIPT"         projectId={projectId} tone="subtle">Scripting</TypeChip>
            <TypeChip current={typeFilter} value="LOOKUP"         projectId={projectId} tone="subtle">Lookup</TypeChip>
            <TypeChip current={typeFilter} value="AI_AGENT"       projectId={projectId} tone="accent">AI Agent</TypeChip>
            <TypeChip current={typeFilter} value="MODEL_CALL"     projectId={projectId} tone="danger">Model Call</TypeChip>
          </div>

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
              <th className="py-3 px-2 label-section w-10"></th>
              <th className="py-3 px-4 label-section">Rule</th>
              <th className="py-3 px-4 label-section">Type</th>
              <th className="py-3 px-4 label-section">Status</th>
              <th className="py-3 px-4 label-section text-right">Version</th>
              <th className="py-3 px-4 label-section w-12"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="text-center py-12 text-subtle font-mono text-sm">Loading…</td></tr>}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center py-16">
                <div className="max-w-sm mx-auto">
                  <div className="h-14 w-14 mx-auto rounded-full bg-accent/10 flex items-center justify-center mb-3">
                    <FileText className="h-6 w-6 text-accent" />
                  </div>
                  <div className="text-sm font-medium text-text mb-1">No rules yet</div>
                  <div className="text-xs text-subtle leading-relaxed mb-4">
                    Pick from 8 rule kinds — from simple decision tables to LLM-backed AI agents — to author your first decision.
                  </div>
                  <button className="btn-primary text-sm" onClick={() => setShowCreate(true)}>
                    <Plus className="h-3.5 w-3.5" />
                    Create your first rule
                  </button>
                </div>
              </td></tr>
            )}
            {filtered.map((r: any, i: number) => {
              const T = String(r.type || '').toUpperCase();
              const Icon = TYPE_ICON[T] || FileText;
              const tone = TYPE_TONE[T] || 'subtle';
              return (
              <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className="py-3 px-4 row-index">{String(i + 1).padStart(2, '0')}</td>
                <td className="py-3 px-2">
                  <div className={`h-7 w-7 rounded flex items-center justify-center border ${TYPE_ICON_CLS[tone] || TYPE_ICON_CLS.subtle}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                </td>
                <td className="py-3 px-4">
                  <Link href={`/projects/${projectId}/rules/${r.slug || r.id}`} className="block group">
                    <div className="text-sm font-medium group-hover:text-accent">{r.name}</div>
                    <div className="text-xs text-subtle font-mono">{r.slug}</div>
                  </Link>
                </td>
                <td className="py-3 px-4">
                  <Pill tone={tone}>{T.replace('_', ' ')}</Pill>
                </td>
                <td className="py-3 px-4"><StatusPill status={r.status} /></td>
                <td className="py-3 px-4 text-right font-mono text-xs text-subtle tabular-nums">v{r.version}</td>
                <td className="py-3 px-4 text-right">
                  <Link href={`/projects/${projectId}/rules/${r.slug || r.id}`}>
                    <ChevronRight className="h-4 w-4 text-subtle inline" />
                  </Link>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

          {/* /closing card overflow-hidden */}
        </div>
      </div>

      {showCreate && (
        <NewRuleDialog
          projectId={projectId}
          folderId={folderId}
          onClose={() => setShowCreate(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['rules', projectId] })}
        />
      )}
    </PageContent>
  );
}

function TypeChip({ current, value, projectId, tone, children }: {
  current: string; value: string; projectId: string;
  tone?: 'info' | 'mint' | 'accent' | 'warn' | 'danger' | 'subtle';
  children: React.ReactNode;
}) {
  const active = current === value;
  const href = value
    ? `/projects/${projectId}/rules?type=${value}`
    : `/projects/${projectId}/rules`;
  const toneCls = active
    ? tone === 'info'   ? 'bg-info/15 text-info border-info/40'
    : tone === 'mint'   ? 'bg-mint/15 text-mint border-mint/40'
    : tone === 'accent' ? 'bg-accent/15 text-accent border-accent/40'
    : tone === 'warn'   ? 'bg-warn/15 text-warn border-warn/40'
    : tone === 'danger' ? 'bg-danger/15 text-danger border-danger/40'
    : 'bg-text/10 text-text border-border'
    : 'bg-transparent text-subtle border-border hover:border-text/40';
  return (
    <Link href={href} className={`pill border ${toneCls}`}>{children}</Link>
  );
}

interface TreeNode { id: string; name: string; parentId: string | null; ruleCount: number; flowCount: number; children?: TreeNode[] }

function FolderTreeView({ folders, folderId, setFolderId, depth, parentId }: {
  folders: TreeNode[]; folderId: string | null; setFolderId: (id: string | null) => void;
  depth: number; parentId: string | null;
}) {
  const here = folders.filter(f => f.parentId === parentId);
  if (here.length === 0) return null;
  return (
    <div>
      {here.map(f => (
        <div key={f.id}>
          <button
            className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted/50 truncate ${folderId === f.id ? 'bg-muted text-text' : 'text-subtle'}`}
            style={{ paddingLeft: `${8 + depth * 12}px` }}
            onClick={() => setFolderId(f.id)}
          >
            <Folder className="h-3 w-3 inline mr-1.5" />
            {f.name}
            <span className="ml-1 text-[10px] text-subtle/70">({f.ruleCount + f.flowCount})</span>
          </button>
          <FolderTreeView folders={folders} folderId={folderId} setFolderId={setFolderId} depth={depth + 1} parentId={f.id} />
        </div>
      ))}
    </div>
  );
}

