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
import {
  Button, ContentSwitcher, Switch, Dropdown, Tag, Table as DataTable, TableHead, TableRow, TableHeader, TableBody, TableCell,
  TableContainer, TableToolbar, TableToolbarContent, TableToolbarSearch,
} from '@carbon/react';
import { Add as Add16, Network_3 as Network16, Template as Template16 } from '@carbon/icons-react';
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

  const TYPES = Object.keys(TYPE_ICON).map(t => ({ id: t, text: label(t) }));
  const STATUS = ['all', 'published', 'draft', 'archived'];
  const folderItems = [{ id: '', text: '—' }, ...folderList.map(f => ({ id: f.id, text: f.path }))];
  const open = (r: any) => router.push(`/projects/${projectId}/rules/${r.slug || r.id}`);

  return (
    <PageContent>
      <PageHeader
        title={typeFilter ? label(typeFilter) + ' rules' : 'Rules'}
        description="Atomic decision units — decision tables, trees, formulas, scripts"
        stats={[
          { label: 'Published', value: stats.published },
          { label: 'Draft',     value: stats.draft },
          { label: 'Total',     value: stats.total },
        ]}
        actions={<>
          <Button kind="ghost" as={Link} href={`/projects/${projectId}/drd`} renderIcon={Network16}>Graph</Button>
          <Button kind="tertiary" as={Link} href={`/projects/${projectId}/templates`} renderIcon={Template16}>Templates</Button>
          {perms.write && <Button kind="primary" renderIcon={Add16} onClick={() => setShowCreate(true)}>New rule</Button>}
        </>}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr] gap-4">
        <FolderPanel projectId={projectId} folders={folders} rules={rules} folderId={folderId} setFolderId={setFolderId} canWrite={!!perms.write} />

        <TableContainer>
          <TableToolbar aria-label="Rules toolbar">
            <TableToolbarContent className="xr-toolbar">
              <ContentSwitcher size="lg" selectedIndex={STATUS.indexOf(filter)} onChange={(e: any) => setFilter(String(e.name))} className="xr-status-switch">
                {STATUS.map(t => <Switch key={t} name={t} text={t[0].toUpperCase() + t.slice(1)} />)}
              </ContentSwitcher>
              <div className="xr-type-filter">
                <Dropdown id="rule-type" titleText="Type" hideLabel label="All types" size="lg" type="inline"
                  items={[{ id: '', text: 'All types' }, ...TYPES]} itemToString={(i: any) => i?.text ?? ''}
                  selectedItem={[{ id: '', text: 'All types' }, ...TYPES].find(t => t.id === typeFilter)}
                  onChange={({ selectedItem }: any) => router.push(`/projects/${projectId}/rules${selectedItem?.id ? `?type=${selectedItem.id}` : ''}`)} />
              </div>
              <TableToolbarSearch persistent placeholder="Search rules" labelText="Search rules" value={search} onChange={(e: any) => setSearch(e?.target?.value ?? '')} />
            </TableToolbarContent>
          </TableToolbar>
          <DataTable size="lg" aria-label="Rules">
            <TableHead>
              <TableRow>
                <TableHeader>Rule</TableHeader>
                <TableHeader>Type</TableHeader>
                <TableHeader>Folder</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader className="xr-num">Version</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={5}>
                  <div className="py-10">
                    <div className="text-[16px] text-[#161616] mb-1">{rules.length ? 'No rules match' : 'Start your first rule'}</div>
                    {perms.write && !rules.length && <Button kind="primary" size="md" renderIcon={Add16} onClick={() => setShowCreate(true)}>New rule</Button>}
                  </div>
                </TableCell></TableRow>
              )}
              {filtered.map((r: any) => {
                const T = String(r.type || '').toUpperCase();
                return (
                  <TableRow key={r.id} draggable={!!perms.write}
                    onDragStart={(e: React.DragEvent) => { e.dataTransfer.setData(DRAG_TYPE, r.id); e.dataTransfer.effectAllowed = 'move'; }}>
                    <TableCell>
                      <Link href={`/projects/${projectId}/rules/${r.slug || r.id}`} className="cds--link">{r.name}</Link>
                      <div className="text-[12px] text-[#6f6f6f] font-mono">{r.slug}</div>
                    </TableCell>
                    <TableCell><Tag type={TYPE_TAG[T] || 'gray'} size="md">{label(T)}</Tag></TableCell>
                    <TableCell className="xr-folder-cell">
                      {perms.write
                        ? <Dropdown id={`folder-${r.id}`} titleText={`Folder of ${r.name}`} hideLabel label="—" size="sm" type="inline"
                            items={folderItems} itemToString={(i: any) => i?.text ?? ''} selectedItem={folderItems.find(f => f.id === (r.folderId || ''))}
                            onChange={({ selectedItem }: any) => moveTo(r.id, selectedItem?.id ?? '')} />
                        : folderList.find(f => f.id === r.folderId)?.path || '—'}
                    </TableCell>
                    <TableCell><Tag type={STATUS_TAG[r.status] || 'gray'} size="md">{r.status}</Tag></TableCell>
                    <TableCell className="xr-num">v{r.version}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </DataTable>
        </TableContainer>
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

const label = (t: string) => t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, ' ');
const TYPE_TAG: Record<string, any> = { DECISION_TABLE: 'blue', DECISION_TREE: 'teal', SCORECARD: 'cyan', FORMULA: 'purple', SCRIPT: 'gray', LOOKUP: 'cool-gray', MODEL_CALL: 'magenta', AI_AGENT: 'warm-gray' };
const STATUS_TAG: Record<string, any> = { published: 'green', draft: 'warm-gray', archived: 'gray' };
