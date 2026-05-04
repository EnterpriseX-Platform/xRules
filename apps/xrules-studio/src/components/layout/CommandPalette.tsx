'use client';
// ⌘K command palette — fuzzy search across Projects · Rules · Flows · sections.
// Opens via topbar search button or window event 'xrules:open-palette'.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Search, FileText, Workflow, FolderKanban, ArrowRight, X,
  Table, Network, BarChart3, Sigma, Code2, BookMarked, Bot, Brain,
  LayoutDashboard, FlaskConical, Sparkles, Activity, Database,
  Plug, KeyRound, Webhook, Wrench, Gauge, GitBranch, ScrollText,
} from 'lucide-react';
import { useProject, useAuth } from '@/lib/store';
import { projectsApi, rulesApi, flowsApi } from '@/lib/api';

type Item = {
  id: string;
  title: string;
  subtitle?: string;
  group: string;
  icon: any;
  href: string;
};

const TYPE_ICON: Record<string, any> = {
  DECISION_TABLE: Table, DECISION_TREE: Network, SCORECARD: BarChart3,
  FORMULA: Sigma, SCRIPT: Code2, LOOKUP: BookMarked, AI_AGENT: Bot, MODEL_CALL: Brain,
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const projectId = useProject((s) => s.currentProjectId);
  const user = useAuth((s) => s.user) as any;
  const tenant: string = user?.tenantId || 'xrules';

  // ⌘K toggle + custom event
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(v => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('xrules:open-palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('xrules:open-palette', onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
      setQuery(''); setActiveIdx(0);
    }
  }, [open]);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
    enabled: open,
    staleTime: 30_000,
  });
  const { data: rules = [] } = useQuery({
    queryKey: ['rules-palette', projectId],
    queryFn: () => projectId ? rulesApi.list(projectId) : Promise.resolve([]),
    enabled: open && !!projectId,
    staleTime: 30_000,
  });
  const { data: flows = [] } = useQuery({
    queryKey: ['flows-palette', projectId],
    queryFn: () => projectId ? flowsApi.list(projectId) : Promise.resolve([]),
    enabled: open && !!projectId,
    staleTime: 30_000,
  });

  // Build static section items
  const sections: Item[] = projectId ? [
    { id: 'sec-dash', title: 'Dashboard', group: 'Go to', icon: LayoutDashboard, href: `/${tenant}` },
    { id: 'sec-projects', title: 'Projects', group: 'Go to', icon: FolderKanban, href: `/${tenant}/projects` },
    { id: 'sec-rules', title: 'Rules', group: 'Go to', icon: FileText, href: `/${tenant}/projects/${projectId}/rules` },
    { id: 'sec-flows', title: 'Flows', group: 'Go to', icon: Workflow, href: `/${tenant}/projects/${projectId}/flows` },
    { id: 'sec-suites', title: 'Test Suites', group: 'Go to', icon: FlaskConical, href: `/${tenant}/projects/${projectId}/test-suites` },
    { id: 'sec-sims', title: 'Simulations', group: 'Go to', icon: Sparkles, href: `/${tenant}/projects/${projectId}/simulations` },
    { id: 'sec-bench', title: 'Bench', group: 'Go to', icon: Gauge, href: `/${tenant}/projects/${projectId}/bench` },
    { id: 'sec-execs', title: 'Executions', group: 'Go to', icon: Activity, href: `/${tenant}/projects/${projectId}/executions` },
    { id: 'sec-ds', title: 'Datasets', group: 'Go to', icon: Database, href: `/${tenant}/projects/${projectId}/datasets` },
    { id: 'sec-rel', title: 'Releases', group: 'Go to', icon: ScrollText, href: `/${tenant}/projects/${projectId}/releases` },
    { id: 'sec-env', title: 'Environments', group: 'Go to', icon: GitBranch, href: `/${tenant}/projects/${projectId}/environments` },
    { id: 'sec-ep', title: 'Endpoints', group: 'Integrations', icon: ArrowRight, href: `/${tenant}/projects/${projectId}/integrations/endpoints` },
    { id: 'sec-keys', title: 'API Keys', group: 'Integrations', icon: KeyRound, href: `/${tenant}/projects/${projectId}/integrations/api-keys` },
    { id: 'sec-wh', title: 'Webhooks', group: 'Integrations', icon: Webhook, href: `/${tenant}/projects/${projectId}/integrations/webhooks` },
    { id: 'sec-conn', title: 'Connections', group: 'Integrations', icon: Plug, href: `/${tenant}/projects/${projectId}/integrations/connections` },
    { id: 'sec-tools', title: 'Tools', group: 'Go to', icon: Wrench, href: `/${tenant}/projects/${projectId}/tools` },
    { id: 'sec-drd', title: 'DRD', group: 'Go to', icon: Network, href: `/${tenant}/projects/${projectId}/drd` },
  ] : [];

  const projectItems: Item[] = (projects as any[]).map((p) => ({
    id: `prj-${p.id}`, title: p.name, subtitle: p.slug, group: 'Projects',
    icon: FolderKanban, href: `/${tenant}/projects/${p.id}`,
  }));
  const ruleItems: Item[] = (rules as any[]).map((r) => ({
    id: `rul-${r.id}`, title: r.name, subtitle: `${r.slug} · ${r.type.toLowerCase().replace('_', ' ')}`,
    group: 'Rules', icon: TYPE_ICON[r.type] || FileText,
    href: `/${tenant}/projects/${projectId}/rules/${r.id}`,
  }));
  const flowItems: Item[] = (flows as any[]).map((f) => ({
    id: `flw-${f.id}`, title: f.name, subtitle: f.slug, group: 'Flows',
    icon: Workflow, href: `/${tenant}/projects/${projectId}/flows/${f.id}`,
  }));

  const all = [...sections, ...projectItems, ...ruleItems, ...flowItems];
  const q = query.trim().toLowerCase();
  const filtered = q
    ? all.filter(i => i.title.toLowerCase().includes(q) || (i.subtitle || '').toLowerCase().includes(q))
    : all;

  // Group for display
  const groups = new Map<string, Item[]>();
  for (const item of filtered) {
    const arr = groups.get(item.group) || [];
    arr.push(item);
    groups.set(item.group, arr);
  }

  function go(item: Item) {
    setOpen(false);
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(filtered.length - 1, i + 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(0, i - 1)); }
    if (e.key === 'Enter') {
      e.preventDefault();
      const it = filtered[activeIdx];
      if (it) go(it);
    }
  }

  if (!open) return null;

  let runningIdx = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative card w-full max-w-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Search className="h-3.5 w-3.5 text-subtle flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
            onKeyDown={onKeyDown}
            placeholder="search rules, flows, sections… ⌘K"
            className="bg-transparent border-0 outline-none flex-1 text-sm py-1"
          />
          <kbd className="font-mono text-[9px] text-subtle bg-surface border border-border rounded px-1.5 py-0.5">esc</kbd>
        </div>
        <div className="max-h-[420px] overflow-y-auto py-2">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-subtle">No matches.</div>
          )}
          {Array.from(groups.entries()).map(([group, items]) => (
            <div key={group} className="mb-1">
              <div className="px-3 py-1 label-section text-[9px]">{group}</div>
              {items.map((item) => {
                runningIdx++;
                const Icon = item.icon;
                const active = runningIdx === activeIdx;
                return (
                  <button
                    key={item.id}
                    onClick={() => go(item)}
                    onMouseEnter={() => setActiveIdx(filtered.indexOf(item))}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs ${active ? 'bg-accent/10 text-text' : 'hover:bg-muted/40'}`}
                  >
                    <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${active ? 'text-accent' : 'text-subtle'}`} />
                    <span className="font-medium truncate">{item.title}</span>
                    {item.subtitle && (
                      <span className="text-[10px] text-subtle font-mono truncate ml-auto">{item.subtitle}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="px-3 py-2 border-t border-border flex items-center justify-between text-[10px] font-mono text-subtle">
          <span>↑↓ navigate · enter select · esc close</span>
          <span>{filtered.length} results</span>
        </div>
      </div>
    </div>
  );
}
