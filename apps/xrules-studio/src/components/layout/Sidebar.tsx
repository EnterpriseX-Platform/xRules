'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, FolderKanban, FileText, Workflow, Brain, Database,
  FlaskConical, Sparkles, ListTree, GitBranch, Activity,
  KeyRound, Plug, Webhook, BookOpen, ScrollText, Settings, ChevronDown,
} from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { useAuth, useProject } from '@/lib/store';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import { cn } from '@/lib/cn';

interface NavItem { href: string; label: string; icon: any; count?: number }

export function Sidebar({ tenant }: { tenant: string }) {
  const pathname = usePathname();
  const project = useProject((s) => s.currentProjectId);
  const setProject = useProject((s) => s.setCurrentProject);
  const [now, setNow] = useState<string>('');

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

  // Live clock for status footer
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      const ss = String(d.getUTCSeconds()).padStart(2, '0');
      setNow(`${hh}:${mm}:${ss}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const currentProject = projects?.find((p: any) => p.id === project);
  const projBase = `/${tenant}/projects/${project || '_'}`;

  const main: NavItem[] = [
    { href: `/${tenant}`, label: 'Dashboard', icon: LayoutDashboard },
    { href: `/${tenant}/projects`, label: 'Projects', icon: FolderKanban },
  ];

  const inProject: NavItem[] = project ? [
    { href: `${projBase}/rules`, label: 'Rules', icon: FileText },
    { href: `${projBase}/flows`, label: 'Flows', icon: Workflow },
    { href: `${projBase}/models`, label: 'Models', icon: Brain },
    { href: `${projBase}/datasets`, label: 'Datasets', icon: Database },
    { href: `${projBase}/test-suites`, label: 'Test Suites', icon: FlaskConical },
    { href: `${projBase}/simulations`, label: 'Simulations', icon: Sparkles },
    { href: `${projBase}/executions`, label: 'Executions', icon: Activity },
    { href: `${projBase}/drd`, label: 'DRD', icon: ListTree },
  ] : [];

  const integrations: NavItem[] = project ? [
    { href: `${projBase}/connections`, label: 'Connections', icon: Plug },
    { href: `${projBase}/api-docs`, label: 'API Docs', icon: BookOpen },
  ] : [];

  const release: NavItem[] = project ? [
    { href: `${projBase}/environments`, label: 'Environments', icon: GitBranch },
    { href: `${projBase}/releases`, label: 'Releases', icon: ScrollText },
  ] : [];

  const system: NavItem[] = [
    { href: `/${tenant}/settings/api-keys`, label: 'API Keys', icon: KeyRound },
    { href: `/${tenant}/settings/webhooks`, label: 'Webhooks', icon: Webhook },
    { href: `/${tenant}/settings`, label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-[240px] shrink-0 border-r border-border bg-sidebar flex flex-col">
      {/* Brand */}
      <div className="h-[60px] px-4 flex items-center gap-2.5 border-b border-border">
        <Logo className="h-7 w-7" />
        <span className="font-bold tracking-tight">XRules</span>
        <span className="ml-auto pill pill-info text-[9px]">BETA</span>
      </div>

      <div className="flex-1 overflow-y-auto py-4 space-y-5">
        {/* Project switcher */}
        <div className="px-4 space-y-2">
          <div className="label-section">Project</div>
          <button
            className="w-full flex items-center gap-2 h-9 px-2 rounded border border-border bg-surface hover:border-accent/50 transition-colors text-left"
            onClick={() => {
              const next = projects?.find((p: any) => p.id !== project);
              if (next) setProject(next.id);
            }}
          >
            <span
              className="h-3 w-3 rounded shrink-0"
              style={{ background: currentProject?.color || 'rgb(var(--c-mint))' }}
            />
            <span className="font-medium text-sm truncate">{currentProject?.name || 'No project'}</span>
            <ChevronDown className="ml-auto h-3.5 w-3.5 text-subtle" />
          </button>
        </div>

        <NavSection label="Main Menu" items={main} pathname={pathname} />
        {project && <NavSection label="In Project" items={inProject} pathname={pathname} />}
        {project && <NavSection label="Release" items={release} pathname={pathname} />}
        {project && <NavSection label="Integrations" items={integrations} pathname={pathname} />}
        <NavSection label="System" items={system} pathname={pathname} />
      </div>

      {/* Status footer */}
      <div className="border-t border-border px-4 py-3 space-y-1.5">
        <div className="label-section mb-2">Status</div>
        <div className="flex items-center justify-between font-mono text-[11px]">
          <div className="flex items-center gap-2">
            <span className="dot bg-ok" />
            <span className="uppercase tracking-label text-subtle">Engine</span>
          </div>
          <span className="text-ok">ONLINE</span>
        </div>
        <div className="flex items-center justify-between font-mono text-[11px]">
          <div className="flex items-center gap-2">
            <span className="dot bg-info" />
            <span className="uppercase tracking-label text-subtle">Clock</span>
          </div>
          <span className="text-text tabular-nums">{now}</span>
        </div>
        <div className="pt-2 text-[10px] font-mono text-subtle/70">rust · axum · v0.2</div>
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
