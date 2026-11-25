'use client';

import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
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
import { usePerms } from '@/lib/perms';
import { Select } from '@/components/ui/Select';
import { Dropdown } from '@/components/pipeline/Dropdown';
import { FolderPanel, flatten, subtreeIds, DRAG_TYPE } from '@/components/rule/FolderPanel';

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
  const perms = usePerms();
  const { projectId } = useParams<{ projectId: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const typeFilter = sp.get('type') || '';
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const pathname = usePathname();

  // Open NewRuleDialog when URL has ?new=1 (from Topbar +New Rule shortcut).
  useEffect(() => {
    if (sp.get('new') === '1') {
      setShowCreate(true);
      const q = new URLSearchParams(sp.toString());
      q.delete('new');
      router.replace(`${pathname}${q.size ? `?${q}` : ''}`);  // pathname excludes the basePath
    }
  }, [sp, router, pathname]);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['rules', projectId, filter],
    queryFn: () => rulesApi.list(projectId, filter === 'all' ? undefined : filter),
  });
  const { data: folders = [] } = useQuery({
    queryKey: ['folders', projectId],
    queryFn: () => api.get<any[]>(`/folders?project_id=${projectId}`),
  });

  const inFolder = folderId ? subtreeIds(folders, folderId) : new Set<string>();
  const folderList = flatten(folders);
  const moveTo = async (ruleId: string, to: string) => { await api.post('/folders/move-item', { kind: 'rule', itemId: ruleId, folderId: to || null }); qc.invalidateQueries({ queryKey: ['rules', projectId] }); qc.invalidateQueries({ queryKey: ['folders', projectId] }); };
  const filtered = rules.filter((r: any) =>
    (!search || r.name.toLowerCase().includes(search.toLowerCase()) || r.slug.includes(search.toLowerCase()))
    && (!typeFilter || String(r.type || '').toUpperCase() === typeFilter)
    && (folderId === null || (!!r.folderId && inFolder.has(r.folderId))),
  );

  const stats = {
    published: rules.filter((r: any) => r.status === 'published').length,
    draft:     rules.filter((r: any) => r.status === 'draft').length,
    total:     rules.length,
  };

  return (
    <PageContent>
      <div className="flex items-center gap-3 mb-4 min-w-0">
        <h1 className="text-[24px] leading-8 text-[#161616]">Rules</h1>
        <span className="text-[13px] text-[#525252] tabular-nums whitespace-nowrap">{stats.total} · {stats.published} published</span>
        <div className="ml-auto flex items-center gap-1 shrink-0">
          {!folders.length && perms.write && <button className="h-9 px-3 text-[14px] text-[#161616] hover:bg-[#e8e8e8] hidden xl:flex items-center gap-1.5" onClick={() => setFoldersOpen(o => !o)}><FolderPlus className="h-4 w-4" />Folders</button>}
          <Link href={`/p/${projectId}/templates`} className="h-9 px-3 text-[14px] text-[#161616] hover:bg-[#e8e8e8] flex items-center gap-1.5"><Sparkles className="h-4 w-4" />Templates</Link>
          <Link href={`/p/${projectId}/drd`} className="h-9 px-3 text-[14px] text-[#161616] hover:bg-[#e8e8e8] flex items-center gap-1.5"><Network className="h-4 w-4" />Graph</Link>
          {perms.write && <button className="h-9 pl-3 pr-4 text-[14px] bg-[#0f62fe] text-white hover:bg-[#0353e9] flex items-center gap-1.5 whitespace-nowrap" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />New rule</button>}
        </div>
      </div>

      <div className={folders.length || foldersOpen ? 'grid grid-cols-1 xl:grid-cols-[220px_1fr] gap-3' : ''}>
        {(folders.length > 0 || foldersOpen) && <div className="hidden xl:block"><FolderPanel projectId={projectId} folders={folders} items={rules} folderId={folderId} setFolderId={setFolderId} canWrite={!!perms.write} /></div>}

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#525252]" />
              <input className="input w-full pl-9" placeholder="Search" aria-label="Search rules" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="w-[160px]"><Dropdown value={typeFilter} onChange={v => router.push(v ? `/p/${projectId}/rules?type=${v}` : `/p/${projectId}/rules`)} options={[{ value: '', label: 'All types' }, { value: 'DECISION_TABLE', label: 'Decision Table' }, { value: 'DECISION_TREE', label: 'Decision Tree' }, { value: 'SCORECARD', label: 'Scorecard' }, { value: 'FORMULA', label: 'Formula' }, { value: 'SCRIPT', label: 'Scripting' }, { value: 'LOOKUP', label: 'Lookup' }, { value: 'AI_AGENT', label: 'AI Agent' }, { value: 'MODEL_CALL', label: 'Model Call' }]} /></div>
            {folders.length > 0 && <div className="w-[160px] xl:hidden"><Dropdown value={folderId || ''} onChange={v => setFolderId(v || null)} options={[{ value: '', label: 'All folders' }, ...flatten(folders).map((f: any) => ({ value: f.id, label: f.name }))]} /></div>}
            <div className="flex border border-[#c6c6c6] h-10">
              {['all', 'published', 'draft', 'archived'].map((t) => (
                <button key={t} className={`px-3 text-[13px] capitalize ${filter === t ? 'bg-[#161616] text-white' : 'text-[#525252] hover:bg-[#f4f4f4]'}`} onClick={() => setFilter(t)}>{t}</button>
              ))}
            </div>
          </div>

          <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead className="bg-muted/30 border-b border-border">
            <tr className="text-left">
              <th className="py-3 px-4 label-section min-w-[220px]">Rule</th>
              <th className="py-3 px-4 label-section">Type</th>
              {folderList.length > 0 && <th className="py-3 px-4 label-section hidden lg:table-cell">Folder</th>}
              <th className="py-3 px-4 label-section">Status</th>
              <th className="py-3 px-4 label-section text-right">Version</th>
              <th className="py-3 px-4 label-section w-12"></th>
            </tr>
          </thead>
          <tbody>
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center py-16">
                <div className="text-[14px] text-[#525252] mb-3">{rules.length ? 'No matching rules' : 'No rules'}</div>
                  {perms.write && !rules.length && (<button className="h-9 pl-3 pr-4 text-[14px] bg-[#0f62fe] text-white inline-flex items-center gap-1.5" onClick={() => setShowCreate(true)}>
                    <Plus className="h-4 w-4" />
                    New rule
                  </button>)}

              </td></tr>
            )}
            {filtered.map((r: any, i: number) => {
              const T = String(r.type || '').toUpperCase();
                            return (
              <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                draggable={!!perms.write} onDragStart={e => { e.dataTransfer.setData(DRAG_TYPE, r.id); e.dataTransfer.effectAllowed = 'move'; }}>
                <td className="py-3 px-4">
                  <Link href={`/p/${projectId}/rules/${r.id}`} className="block group">
                    <div className="text-sm font-medium group-hover:text-accent">{r.name}</div>
                  </Link>
                </td>
                <td className="py-3 px-4">
                  <span className="text-[14px] text-[#525252] whitespace-nowrap">{T.charAt(0) + T.slice(1).toLowerCase().replace(/_/g, ' ')}</span>
                </td>
                {folderList.length > 0 && <td className="py-3 px-4 hidden lg:table-cell text-[14px] text-[#525252]">{folderList.find(f => f.id === r.folderId)?.path || '—'}</td>}
                <td className="py-3 px-4"><StatusPill status={r.status} /></td>
                <td className="py-3 px-4 text-right font-mono text-xs text-subtle tabular-nums">v{r.version}</td>
                <td className="py-3 px-4 text-right">
                  <Link href={`/p/${projectId}/rules/${r.id}`}>
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
    ? `/p/${projectId}/rules?type=${value}`
    : `/p/${projectId}/rules`;
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
