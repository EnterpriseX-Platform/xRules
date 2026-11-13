'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard, FolderKanban, FileText, Brain, FlaskConical,
  Activity, KeyRound, Plug, Webhook, ScrollText, Settings,
  ChevronDown, Workflow, Briefcase, ListTree, Zap,
  Database, Layers, Network, BookA, Rows3, GitCompare, BadgeCheck, Timer, ListChecks, Gauge, PieChart, HeartPulse, Bell, History,
  UserCog,
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

  // Follow the project in the URL; drop a stored project that no longer exists
  useEffect(() => {
    if (!projects?.length) return;
    const fromUrl = pathname.match(/^\/projects\/([^/]+)/)?.[1];
    const urlProject = fromUrl && projects.find((p: any) => p.id === fromUrl || p.slug === fromUrl);
    if (urlProject && urlProject.id !== project) { setProject(urlProject.id); return; }
    if (!project || !projects.some((p: any) => p.id === project)) setProject(projects[0].id);
  }, [projects, project, setProject, pathname]);

  const currentProject = projects?.find((p: any) => p.id === project);
  const projBase = `/projects/${project || '_'}`;

  // Top-level (no section header) — daily entry points.
  const top: NavItem[] = [
    { href: `/`,         label: 'Dashboard', icon: LayoutDashboard },
    { href: `/projects`, label: 'Projects',  icon: FolderKanban },
  ];

  // Decision Engine — write, check and ship decisions.
  const engine: NavItem[] = project ? [
    { href: `${projBase}/rules`,            label: 'Rules',          icon: FileText },
    { href: `${projBase}/flows?kind=DECISION`, label: 'Decision Flows', icon: Workflow },
    { href: `${projBase}/vocabulary`,       label: 'Vocabulary',     icon: BookA },
    { href: `${projBase}/bulk`,             label: 'Bulk Runs',      icon: Rows3 },
    { href: `${projBase}/simulations`,      label: 'Simulations',    icon: GitCompare },
    { href: `${projBase}/models`,           label: 'Models',         icon: Brain },
    { href: `${projBase}/releases`,         label: 'Releases',       icon: ScrollText },
    { href: `${projBase}/approvals`,        label: 'Approvals',      icon: BadgeCheck },
  ] : [];

  // Integration — data in, APIs out (DEH style: REST APIs and Triggers).
  const integration: NavItem[] = project ? [
    { href: `${projBase}/apis`,                      label: 'REST APIs',   icon: Zap },
    { href: `${projBase}/triggers`,                  label: 'Triggers',    icon: Timer },
    { href: `${projBase}/data-sets`,                 label: 'Data Sets',   icon: Layers },
    { href: `${projBase}/integrations/connections`, label: 'Connections', icon: Database },
    { href: `${projBase}/integrations/api-keys`,    label: 'API Keys',    icon: KeyRound },
  ] : [];

  // Testing
  const testing: NavItem[] = project ? [
    { href: `${projBase}/tests`,       label: 'Test Suites', icon: FlaskConical },
    { href: `${projBase}/test-runs`,   label: 'Test Runs',   icon: ListChecks },
  ] : [];

  // Monitor
  const monitor: NavItem[] = project ? [
    { href: `${projBase}/monitor`,              label: 'Overview',    icon: Gauge },
    { href: `${projBase}/monitor/traffic`,      label: 'API Traffic', icon: Activity },
    { href: `${projBase}/monitor/decisions`,    label: 'Decisions',   icon: PieChart },
    { href: `${projBase}/monitor/data-health`,  label: 'Data Health', icon: HeartPulse },
    { href: `${projBase}/monitor/alerts`,       label: 'Alerts',      icon: Bell },
    { href: `${projBase}/executions`,           label: 'Executions',  icon: History },
    { href: `${projBase}/audit`,                label: 'Audit Log',   icon: ListTree },
  ] : [];
  const projectNav: NavItem[] = projBase ? [
    { href: `${projBase}/access`, label: 'Members & Access', icon: UserCog },
  ] : [];

  return (
    <aside className="w-[228px] shrink-0 border-r border-border/40 bg-sidebar flex flex-col">
      {/* Brand */}
      <div className="h-[48px] -mr-px relative z-10 px-4 flex items-center gap-2.5 bg-[#161616] text-white">
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

        {project && <NavSection id="engine"      label="Decision Engine" items={engine}      pathname={pathname} />}
        {project && <NavSection id="integration" label="Integration"     items={integration} pathname={pathname} />}
        {project && <NavSection id="testing"     label="Testing"         items={testing}     pathname={pathname} />}
        {project && <NavSection id="monitor"     label="Monitor"         items={monitor}     pathname={pathname} />}
        {project && <NavSection id="project"     label="Project"         items={projectNav}  pathname={pathname} />}

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

function NavSection({ label, items, pathname }: {
  id: string; label: string; items: NavItem[]; pathname: string;
}) {
  if (!items.length) return null;
  return (
    <div className="space-y-0.5">
      <div className="px-4 pt-1 pb-0.5 text-[12px] font-semibold text-[#525252]">{label}</div>
      <div className="px-2">
        {items.map((it) => <NavRow key={it.href} item={it} pathname={pathname} />)}
      </div>
    </div>
  );
}

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
