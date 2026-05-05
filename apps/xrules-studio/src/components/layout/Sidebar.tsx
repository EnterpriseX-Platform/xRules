'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard, FolderKanban, FileText, Workflow, Brain, Database,
  FlaskConical, Sparkles, ListTree, GitBranch, Activity,
  KeyRound, Plug, Webhook, BookOpen, ScrollText, Settings, ChevronDown,
  Table, Network, Code2, BookMarked, Bot, Zap, Briefcase, Wrench, Gauge,
} from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { useAuth, useProject } from '@/lib/store';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import { cn } from '@/lib/cn';

interface NavItem { href: string; label: string; icon: any; count?: number }

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

  // User-journey IA: Build → Test → Deploy → Integrate → Monitor.
  const main: NavItem[] = [
    { href: `/`, label: 'Dashboard', icon: LayoutDashboard },
    { href: `/projects`, label: 'Projects', icon: FolderKanban },
  ];

  // BUILD — author rules, supporting artifacts. Rule Flow is now a rule
  // type (visual orchestration), not a separate entity. Integration flows
  // (async / HTTP / Kafka) live under INTEGRATE.
  const build: NavItem[] = project ? [
    { href: `${projBase}/rules`,                   label: 'Rules',       icon: FileText },
    { href: `${projBase}/models`,                  label: 'Models',      icon: Brain },
    { href: `${projBase}/templates`,               label: 'Templates',   icon: BookOpen },
  ] : [];

  // TEST — make sure they work before shipping
  const test: NavItem[] = project ? [
    { href: `${projBase}/test-suites`, label: 'Test Suites', icon: FlaskConical },
    { href: `${projBase}/datasets`,    label: 'Datasets',    icon: Database },
    { href: `${projBase}/simulations`, label: 'Simulations', icon: Sparkles },
    { href: `${projBase}/bench`,       label: 'Bench',       icon: Gauge },
  ] : [];

  // DEPLOY — pin a snapshot to environments
  const deploy: NavItem[] = project ? [
    { href: `${projBase}/releases`,     label: 'Releases',     icon: ScrollText },
    { href: `${projBase}/environments`, label: 'Environments', icon: GitBranch },
  ] : [];

  // INTEGRATE — inbound (endpoints, keys, webhooks, sdk), outbound (connections),
  // and async orchestration (integration flows that fetch data + run jobs).
  const integrate: NavItem[] = project ? [
    { href: `${projBase}/integrations/endpoints`,   label: 'Endpoints',          icon: Zap },
    { href: `${projBase}/integrations/api-keys`,    label: 'API Keys',           icon: KeyRound },
    { href: `${projBase}/integrations/webhooks`,    label: 'Webhooks',           icon: Webhook },
    { href: `${projBase}/integrations/connections`, label: 'Connections',        icon: Plug },
    { href: `${projBase}/flows?kind=INTEGRATION`,   label: 'Integration Flows',  icon: Workflow },
    { href: `${projBase}/integrations/api-docs`,    label: 'API Docs',           icon: BookMarked },
  ] : [];

  // MONITOR — see what's running and what happened
  const monitor: NavItem[] = project ? [
    { href: `${projBase}/executions`, label: 'Executions', icon: Activity },
    { href: `${projBase}/jobs`,       label: 'Jobs',       icon: Briefcase },
    { href: `${projBase}/audit`,      label: 'Audit Log',  icon: ListTree },
    { href: `${projBase}/tools`,      label: 'Tools',      icon: Wrench },
    { href: `${projBase}/drd`,        label: 'DRD',        icon: Network },
  ] : [];

  const system: NavItem[] = [
    { href: `/settings`, label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-[240px] shrink-0 border-r border-border bg-sidebar flex flex-col">
      {/* Brand */}
      <div className="h-[60px] px-4 flex items-center gap-2.5 border-b border-border/70">
        <Logo className="h-7 w-7" />
        <span className="text-[15px] font-semibold tracking-tight">
          XRULES<span className="text-accent">.io</span>
        </span>
        <span className="ml-auto pill pill-info text-[9px]">BETA</span>
      </div>

      <div className="flex-1 overflow-y-auto py-4 space-y-5">
        {/* Project switcher — real dropdown */}
        <div className="px-4 space-y-2">
          <div className="label-section">Project</div>
          <ProjectPicker
            projects={projects || []}
            current={currentProject}
            onPick={(p) => setProject(p.id)}
          />
        </div>

        <NavSection label="Main Menu" items={main} pathname={pathname} />
        {project && <NavSection label="Build"     items={build}     pathname={pathname} />}
        {project && <NavSection label="Integrate" items={integrate} pathname={pathname} />}
        {project && <NavSection label="Test"      items={test}      pathname={pathname} />}
        {project && <NavSection label="Deploy"    items={deploy}    pathname={pathname} />}
        {project && <NavSection label="Monitor"   items={monitor}   pathname={pathname} />}
        <NavSection label="System" items={system} pathname={pathname} />
      </div>

      {/* Status footer — minimal */}
      <div className="border-t border-border/70 px-4 py-3 flex items-center justify-between text-[11px] text-subtle">
        <div className="flex items-center gap-1.5">
          <span className="dot bg-ok" />
          <span>Engine online</span>
        </div>
        <span className="opacity-60">v0.2</span>
      </div>
    </aside>
  );
}

function NavSection({ label, items, pathname }: { label: string; items: NavItem[]; pathname: string }) {
  if (!items.length) return null;
  return (
    <div className="space-y-1">
      <div className="label-section px-4 mb-2">{label}</div>
      <div className="px-2 space-y-0.5">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn('nav-row', active && 'nav-row-active')}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.count !== undefined && (
                <span className="font-mono text-[10px] text-subtle bg-muted px-1.5 py-0.5 rounded tabular-nums">
                  {String(item.count).padStart(2, '0')}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
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
    // Reroute to the project's dashboard / rules so the URL stays in sync
    router.push(`/projects/${p.slug || p.id}/rules`);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="w-full flex items-center gap-2 h-9 px-2 rounded-md border border-border/70 bg-surface hover:border-accent/50 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className="h-3 w-3 rounded shrink-0"
          style={{ background: current?.color || 'rgb(var(--c-mint))' }}
        />
        <span className="font-medium text-sm truncate">{current?.name || 'No project'}</span>
        <ChevronDown className={cn('ml-auto h-3.5 w-3.5 text-subtle transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 rounded-md border border-border/70 bg-surface shadow-lg max-h-72 overflow-y-auto">
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
          <div className="border-t border-border/70">
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
