'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard, FolderKanban, FileText, Brain, FlaskConical,
  Activity, KeyRound, Plug, Webhook, ScrollText, Settings,
  ChevronDown, Workflow, Briefcase, ListTree, Zap,
  Database, Layers, Network,
} from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { useProject } from '@/lib/store';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import { cn } from '@/lib/cn';

interface NavItem { href: string; label: string; icon: any }

// Persisted collapse state — survives reloads.
const COLLAPSE_KEY = 'xrules:sidebar:collapsed';
function readCollapsed(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}'); } catch { return {}; }
}
function writeCollapsed(v: Record<string, boolean>) {
  try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(v)); } catch {}
}

export function Sidebar() {
  const pathname = usePathname();
  const project = useProject((s) => s.currentProjectId);
  const setProject = useProject((s) => s.setCurrentProject);

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
    retry: false,
  });

  // Auto-pick first project
  useEffect(() => {
    if (!project && projects && projects.length > 0) {
      setProject(projects[0].id);
    }
  }, [projects, project, setProject]);

  const currentProject = projects?.find((p: any) => p.id === project);
  const projBase = `/projects/${project || '_'}`;

  // Top-level (no section header) — daily entry points.
  const top: NavItem[] = [
    { href: `/`,         label: 'Dashboard', icon: LayoutDashboard },
    { href: `/projects`, label: 'Projects',  icon: FolderKanban },
  ];

  // Workspace — author. (Templates lives as a CTA on Rules. DRD as a tab.)
  const workspace: NavItem[] = project ? [
    { href: `${projBase}/rules`,       label: 'Rules',       icon: FileText },
    { href: `${projBase}/models`,      label: 'Models',      icon: Brain },
    { href: `${projBase}/test-suites`, label: 'Test Suites', icon: FlaskConical },
  ] : [];

  // Data — Data Layer: pull, shape, check and keep the data rules read.
  const data: NavItem[] = project ? [
    { href: `${projBase}/data-flows`,                label: 'Data Flows',  icon: Network },
    { href: `${projBase}/data-sets`,                 label: 'Data Sets',   icon: Layers },
    { href: `${projBase}/integrations/connections`, label: 'Connections', icon: Database },
  ] : [];

  // Ship — expose, version, distribute. (Environments folded into Releases.)
  const ship: NavItem[] = project ? [
    { href: `${projBase}/integrations/endpoints`,   label: 'Endpoints',         icon: Zap },
    { href: `${projBase}/flows?kind=DECISION`,      label: 'Decision Flows',    icon: Workflow },
    { href: `${projBase}/flows?kind=INTEGRATION`,   label: 'Integration Flows', icon: Workflow },
    { href: `${projBase}/releases`,                 label: 'Releases',          icon: ScrollText },
  ] : [];

  // Access — credentials & external systems.
  const access: NavItem[] = project ? [
    { href: `${projBase}/integrations/api-keys`,    label: 'API Keys',    icon: KeyRound },
    { href: `${projBase}/integrations/webhooks`,    label: 'Webhooks',    icon: Webhook },
  ] : [];

  // Observe — read-only.
  const observe: NavItem[] = project ? [
    { href: `${projBase}/executions`, label: 'Executions', icon: Activity },
    { href: `${projBase}/jobs`,       label: 'Jobs',       icon: Briefcase },
    { href: `${projBase}/audit`,      label: 'Audit Log',  icon: ListTree },
  ] : [];

  return (
    <aside className="w-[228px] shrink-0 border-r border-border/40 bg-sidebar flex flex-col">
      {/* Brand */}
      <div className="h-[48px] px-4 flex items-center gap-2.5 bg-[#161616] text-white">
        <Logo className="h-5 w-5" />
        <span className="text-[14px] font-semibold tracking-tight">
          xRules
        </span>
      </div>

      <div className="flex-1 overflow-y-auto py-3 space-y-3">
        {/* Project picker */}
        <div className="px-3">
          <ProjectPicker
            projects={projects || []}
            current={currentProject}
            onPick={(p) => setProject(p.id)}
          />
        </div>

        {/* Ungrouped top */}
        <div className="px-2 space-y-0.5">
          {top.map((it) => <NavRow key={it.href} item={it} pathname={pathname} />)}
        </div>

        {project && <NavSection id="workspace" label="Workspace" items={workspace} pathname={pathname} />}
        {project && <NavSection id="data"      label="Data"      items={data}      pathname={pathname} />}
        {project && <NavSection id="ship"      label="Ship"      items={ship}      pathname={pathname} />}
        {project && <NavSection id="access"    label="Access"    items={access}    pathname={pathname} />}
        {project && <NavSection id="observe"   label="Observe"   items={observe}   pathname={pathname} />}

        {/* Settings — ungrouped, with hairline separator */}
        <div className="px-2 pt-3 mt-2">
          <div className="hr mb-2 mx-1" />
          <NavRow
            item={{ href: '/settings', label: 'Settings', icon: Settings }}
            pathname={pathname}
          />
        </div>
      </div>

      {/* Status footer — hairline divider, low-key */}
      <div className="px-4 py-2.5 flex items-center justify-between text-[11px] text-subtle border-t border-border/40">
        <div className="flex items-center gap-1.5">
          <span className="dot bg-ok shadow-[0_0_8px_rgb(var(--c-ok)/0.5)]" />
          <span>Engine online</span>
        </div>
        <span className="opacity-50 font-mono text-[10px]">v0.2</span>
      </div>
    </aside>
  );
}

function NavSection({ id, label, items, pathname }: {
  id: string; label: string; items: NavItem[]; pathname: string;
}) {
  const [collapsed, setCollapsed] = useState<boolean>(false);
  // Hydrate from localStorage on mount
  useEffect(() => {
    setCollapsed(!!readCollapsed()[id]);
  }, [id]);
  function toggle() {
    const next = { ...readCollapsed(), [id]: !collapsed };
    writeCollapsed(next);
    setCollapsed(!collapsed);
  }
  if (!items.length) return null;
  // If active route is inside this section, force open
  const hasActive = items.some((i) => pathname === i.href || pathname.startsWith(i.href + '/'));
  const open = !collapsed || hasActive;
  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center gap-1.5 px-4 py-1 text-left group"
      >
        <span className="label-section">{label}</span>
        <ChevronDown
          className={cn(
            'h-3 w-3 text-subtle/40 ml-auto transition-transform',
            !open && '-rotate-90',
          )}
        />
      </button>
      {open && (
        <div className="px-2 space-y-0.5">
          {items.map((it) => <NavRow key={it.href} item={it} pathname={pathname} />)}
        </div>
      )}
    </div>
  );
}

// Pick the single nav item that best matches the current URL: longest path prefix wins,
// and items sharing a path (Decision / Integration Flows) are told apart by their ?kind=.
let ALL_ITEMS: NavItem[] = [];
function bestHref(pathname: string): string | null {
  const kind = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('kind') : null;
  let best: NavItem | null = null; let bestScore = -1;
  for (const it of ALL_ITEMS) {
    const [path, qs] = it.href.split('?');
    if (!(pathname === path || pathname.startsWith(path + '/'))) continue;
    const itKind = qs ? new URLSearchParams(qs).get('kind') : null;
    if (itKind && kind && itKind.toLowerCase() !== kind.toLowerCase()) continue;
    const score = path.length * 2 + (itKind && kind ? 1 : 0);
    if (score > bestScore) { best = it; bestScore = score; }
  }
  return best?.href ?? null;
}

function NavRow({ item, pathname }: { item: NavItem; pathname: string }) {
  if (!ALL_ITEMS.includes(item) && !ALL_ITEMS.some(i => i.href === item.href)) ALL_ITEMS.push(item);
  const active = bestHref(pathname) === item.href;
  const Icon = item.icon;
  return (
    <Link href={item.href} className={cn('nav-row', active && 'nav-row-active')}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
    </Link>
  );
}

function ProjectPicker({ projects, current, onPick }: {
  projects: any[];
  current: any;
  onPick: (p: any) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function pick(p: any) {
    onPick(p);
    setOpen(false);
    router.push(`/projects/${p.slug || p.id}/rules`);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="w-full flex items-center gap-2 h-8 px-2 rounded-md border border-border/60 bg-surface hover:border-accent/50 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className="h-2.5 w-2.5 rounded shrink-0"
          style={{ background: current?.color || 'rgb(var(--c-mint))' }}
        />
        <span className="font-medium text-[13px] truncate">{current?.name || 'No project'}</span>
        <ChevronDown className={cn('ml-auto h-3 w-3 text-subtle transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 rounded-md border border-border/60 bg-surface shadow-lg max-h-72 overflow-y-auto">
          {projects.length === 0 && (
            <div className="px-3 py-2 text-xs text-subtle">No projects</div>
          )}
          {projects.map((p) => {
            const active = p.id === current?.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => pick(p)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm',
                  active ? 'bg-accent/10 text-accent' : 'hover:bg-muted/60',
                )}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ background: p.color || 'rgb(var(--c-mint))' }}
                />
                <span className="font-medium truncate">{p.name}</span>
                <span className="ml-auto font-mono text-[10px] text-subtle">{p.slug}</span>
              </button>
            );
          })}
          <div className="border-t border-border/60">
            <Link
              href={`/projects`}
              className="block px-2 py-1.5 text-xs text-accent hover:bg-muted/60"
              onClick={() => setOpen(false)}
            >
              Manage projects →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
