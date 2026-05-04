'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, Plus, Sun, Moon, Bell, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTheme, useAuth, useProject } from '@/lib/store';
import { api } from '@/lib/api';

interface Crumb { label: string; href?: string; mono?: boolean }

// Parse pathname into a human-friendly trail. Falls back to raw segments
// only when name lookups don't apply.
function useBreadcrumbs(pathname: string): Crumb[] {
  const parts = pathname.split('/').filter(Boolean);
  // Routes look like: [tenant] / projects / [projectId] / [section] / [maybeId] / [maybeSubsection]
  const tenant = parts[0];
  const projectId = parts[1] === 'projects' ? parts[2] : undefined;
  const section = parts[1] === 'projects' ? parts[3] : undefined;
  const subId = parts[1] === 'projects' ? parts[4] : undefined;

  // Fetch project name (works with id or slug — backend resolves either)
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectId ? api.get<any>(`/projects/${projectId}`) : null,
    enabled: !!projectId,
    staleTime: 60_000,
    retry: false,
  });

  // Fetch rule name when on /rules/[ruleId-or-slug]
  const isRule = section === 'rules' && !!subId;
  const { data: rule } = useQuery({
    queryKey: ['rule-crumb', subId],
    queryFn: () => api.get<any>(`/rules/${subId}`),
    enabled: isRule,
    staleTime: 60_000,
    retry: false,
  });

  // Build crumbs
  const out: Crumb[] = [];
  if (tenant) out.push({ label: tenant.toUpperCase(), href: `/${tenant}`, mono: true });
  if (parts[1] === 'projects' && !projectId) {
    out.push({ label: 'Projects', href: `/${tenant}/projects` });
  }
  if (project) {
    out.push({ label: project.name, href: `/${tenant}/projects/${project.slug || projectId}` });
  } else if (projectId) {
    // Show slug-style as-is (no truncation) when looks human-readable; fall
    // back to short cuid prefix when it's an id we couldn't resolve.
    const looksLikeId = /^[a-z0-9]{20,}$/i.test(projectId) && !projectId.includes('-');
    out.push({ label: looksLikeId ? projectId.slice(0, 8) + '…' : projectId, mono: looksLikeId });
  }
  if (section) {
    const human: Record<string, string> = {
      rules: 'Rules', flows: 'Flows', models: 'Models', datasets: 'Datasets',
      'test-suites': 'Test Suites', simulations: 'Simulations', releases: 'Releases',
      environments: 'Environments', executions: 'Executions', jobs: 'Jobs',
      audit: 'Audit Log', tools: 'Tools', bench: 'Bench', drd: 'DRD',
      templates: 'Templates', integrations: 'Integrations', connections: 'Connections',
    };
    const sectionLabel = human[section] || section;
    if (subId) {
      out.push({ label: sectionLabel, href: `/${tenant}/projects/${projectId}/${section}` });
    } else {
      out.push({ label: sectionLabel });
    }
  }
  if (rule) {
    out.push({ label: rule.name });
  } else if (subId) {
    const looksLikeId = /^[a-z0-9]{20,}$/i.test(subId) && !subId.includes('-');
    out.push({ label: looksLikeId ? subId.slice(0, 8) + '…' : subId, mono: looksLikeId });
  }
  // Sub-sub-section (e.g., integrations/api-keys)
  if (parts.length > 4 && parts[1] === 'projects' && parts[3] === 'integrations') {
    const sub = parts[4];
    const human: Record<string, string> = {
      'api-keys': 'API Keys', webhooks: 'Webhooks', endpoints: 'Endpoints',
      connections: 'Connections', 'api-docs': 'API Docs',
    };
    out.push({ label: human[sub] || sub });
  }

  return out;
}

export function Topbar() {
  const pathname = usePathname();
  const theme = useTheme((s) => s.theme);
  const toggle = useTheme((s) => s.toggle);
  const user = useAuth((s) => s.user);
  const projectId = useProject((s) => s.currentProjectId);

  const crumbs = useBreadcrumbs(pathname);
  const isRulesContext = pathname.includes('/rules');
  const onProjectsList = pathname.endsWith('/projects');

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="h-[60px] shrink-0 border-b border-border bg-bg flex items-center px-4 gap-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs min-w-0">
        <span className="text-accent font-mono">{'>'}</span>
        <span className="text-subtle font-mono">~</span>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5 min-w-0">
            <ChevronRight className="h-3 w-3 text-subtle/50 flex-shrink-0" />
            {c.href ? (
              <Link
                href={c.href}
                className={c.mono
                  ? 'font-mono uppercase tracking-label text-subtle hover:text-text transition-colors truncate'
                  : 'text-text hover:text-accent transition-colors truncate'}
              >
                {c.label}
              </Link>
            ) : (
              <span className={c.mono
                ? 'font-mono uppercase tracking-label text-text truncate'
                : 'text-text font-medium truncate'}
              >
                {c.label}
              </span>
            )}
          </span>
        ))}
      </nav>

      {/* Live status pills */}
      <div className="hidden md:flex items-center gap-2 ml-4 flex-shrink-0">
        <span className="live-pill">
          <span className="dot bg-ok" />
          <span>SOLVER</span>
          <span className="text-text tabular-nums" suppressHydrationWarning>{nowUtc()}</span>
          <span className="text-subtle/60">UTC</span>
        </span>
        <span className="live-pill">
          <span>v0.2.0</span>
        </span>
        <span className="live-pill">
          <span className="text-subtle/60">t=</span>
          <span className="text-text tabular-nums">{String(tick).padStart(4, '0')}</span>
        </span>
      </div>

      {/* Search palette */}
      <button
        className="ml-auto relative w-80 max-w-full hidden lg:flex items-center input pl-9 pr-12 text-left"
        onClick={() => window.dispatchEvent(new CustomEvent('xrules:open-palette'))}
      >
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-subtle" />
        <span className="text-subtle text-xs">search rules, flows, projects…</span>
        <span className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-subtle bg-surface border border-border rounded px-1.5 py-0.5">
          ⌘K
        </span>
      </button>

      {/* Context-aware primary action */}
      {!onProjectsList && projectId && (
        <Link
          href={isRulesContext
            ? `/${pathname.split('/')[1]}/projects/${projectId}/rules?new=1`
            : `/${pathname.split('/')[1]}/projects/${projectId}/rules`}
          className="btn-primary"
        >
          <Plus className="h-3.5 w-3.5" />
          New Rule
        </Link>
      )}

      <button className="btn-ghost" onClick={toggle} aria-label="Toggle theme">
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <button className="btn-ghost relative" aria-label="Notifications">
        <Bell className="h-4 w-4" />
        <span className="absolute top-1.5 right-1.5 dot bg-danger" />
      </button>

      <div className="h-7 w-7 rounded bg-accent/10 text-accent flex items-center justify-center text-sm font-mono">
        {user?.email?.[0]?.toUpperCase() || 'A'}
      </div>
    </header>
  );
}

function nowUtc() {
  const d = new Date();
  return [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}
