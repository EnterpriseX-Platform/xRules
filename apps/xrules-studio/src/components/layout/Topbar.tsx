'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, Plus, Sun, Moon, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTheme, useAuth, useProject } from '@/lib/store';
import { api } from '@/lib/api';
import { TenantSwitcher } from './TenantSwitcher';

interface Crumb { label: string; href?: string; mono?: boolean }

// Parse pathname into a human-friendly trail. Falls back to raw segments
// only when name lookups don't apply.
function useBreadcrumbs(pathname: string): Crumb[] {
  const parts = pathname.split('/').filter(Boolean);
  // Routes look like: projects / [projectId] / [section] / [maybeId] / [maybeSubsection]
  const projectId = parts[0] === 'projects' ? parts[1] : undefined;
  const section = parts[0] === 'projects' ? parts[2] : undefined;
  const subId = parts[0] === 'projects' ? parts[3] : undefined;

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

  // Flow / Data Set names for their detail pages
  const isFlow = (section === 'flows' || section === 'data-flows') && !!subId;
  const isSet = section === 'data-sets' && !!subId;
  const isSpec = section === 'apis' && !!subId;
  const { data: entity } = useQuery({
    queryKey: ['crumb', section, subId],
    queryFn: () => api.get<any>(isFlow ? `/flows/${subId}` : isSpec ? `/platform/specs/${subId}` : `/data/datasets/${subId}`),
    enabled: isFlow || isSet || isSpec,
    staleTime: 60_000,
    retry: false,
  });

  // Build crumbs
  const out: Crumb[] = [{ label: 'Home', href: `/`, mono: false }];
  if (parts[0] === 'projects' && !projectId) {
    out.push({ label: 'Projects', href: `/projects` });
  }
  if (project) {
    out.push({ label: project.name, href: `/projects/${project.slug || projectId}` });
  } else if (projectId) {
    const looksLikeId = /^[a-z0-9]{20,}$/i.test(projectId) && !projectId.includes('-');
    out.push({ label: looksLikeId ? projectId.slice(0, 8) + '…' : projectId, mono: looksLikeId });
  }
  if (parts[0] === 'settings') {
    out.push({ label: 'Settings', href: parts[1] ? '/settings' : undefined });
    if (parts[1]) out.push({ label: ({ tenant: 'Tenant', 'api-keys': 'API Keys', webhooks: 'Webhooks' } as Record<string, string>)[parts[1]] || parts[1] });
  }
  if (section) {
    const human: Record<string, string> = {
      rules: 'Rules', flows: 'Flows', models: 'Models', datasets: 'Datasets',
      'test-suites': 'Test Suites', simulations: 'Simulations', releases: 'Releases',
      environments: 'Environments', executions: 'Executions', jobs: 'Jobs',
      audit: 'Audit Log', tools: 'Tools', bench: 'Bench', drd: 'DRD',
      templates: 'Templates', integrations: 'Integrations', connections: 'Connections',
      'data-flows': 'Data Flows', 'data-sets': 'Data Sets', apis: 'REST APIs', triggers: 'Triggers', bulk: 'Bulk Runs',
      approvals: 'Approvals', access: 'Members & Access', vocabulary: 'Vocabulary', tests: 'Test Suites', 'test-runs': 'Test Runs', monitor: 'Monitor',
    };
    const sectionLabel = human[section] || section;
    if (subId) {
      out.push({ label: sectionLabel, href: `/projects/${projectId}/${section}` });
    } else {
      out.push({ label: sectionLabel });
    }
  }
  // Add subId as an entity (rule, flow, etc) — but not for integrations,
  // where the sub-path is a sub-section, not an entity.
  const isIntegrationsSub = section === 'integrations';
  const isMonitorSub = section === 'monitor';
  if (rule) {
    out.push({ label: rule.name });
  } else if (entity && (isFlow || isSet || isSpec)) {
    out.push({ label: entity.name || entity.slug });
  } else if (subId && !isIntegrationsSub && !isMonitorSub) {
    const looksLikeId = /^[a-z0-9]{20,}$/i.test(subId) && !subId.includes('-');
    out.push({ label: looksLikeId ? subId.slice(0, 8) + '…' : subId, mono: looksLikeId });
  }
  // Integrations sub-section (api-keys, webhooks, endpoints, connections, api-docs)
  if (section === 'monitor' && subId) {
    out.pop();
    out.push({ label: 'Monitor', href: `/projects/${projectId}/monitor` });
    out.push({ label: ({ traffic: 'API Traffic', decisions: 'Decisions', 'data-health': 'Data Health', alerts: 'Alerts' } as Record<string, string>)[subId] || subId });
  }
  if (isIntegrationsSub && subId) {
    const human: Record<string, string> = {
      'api-keys': 'API Keys', webhooks: 'Webhooks', endpoints: 'Endpoints',
      connections: 'Connections', 'api-docs': 'API Docs',
    };
    out.push({ label: human[subId] || subId });
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

  return (
    <header className="h-[48px] shrink-0 bg-[#161616] text-[#c6c6c6] flex items-center pl-2 pr-5 gap-4">
      <TenantSwitcher />
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm min-w-0">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5 min-w-0">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-[#6f6f6f] flex-shrink-0" />}
            {c.href ? (
              <Link
                href={c.href}
                className="text-[#c6c6c6] hover:text-white transition-colors truncate"
              >
                {c.label}
              </Link>
            ) : (
              <span className="text-white font-medium truncate">
                {c.label}
              </span>
            )}
          </span>
        ))}
      </nav>

      {/* Search palette */}
      <button
        className="ml-auto relative w-72 max-w-full hidden lg:flex items-center pl-9 pr-14 text-left h-8 bg-[#393939] hover:bg-[#474747]"
        onClick={() => window.dispatchEvent(new CustomEvent('xrules:open-palette'))}
      >
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#c6c6c6]" />
        <span className="text-[#c6c6c6] text-[13px]">Search…</span>
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-[#a8a8a8]">⌘K</span>
      </button>

      {/* Context-aware primary action */}
      {!onProjectsList && projectId && (
        <Link
          href={isRulesContext
            ? `/projects/${projectId}/rules?new=1`
            : `/projects/${projectId}/rules`}
          className="btn-primary"
        >
          <Plus className="h-3.5 w-3.5" />
          New Rule
        </Link>
      )}

      <button className="btn-ghost" onClick={toggle} aria-label="Toggle theme">
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div
        className="h-8 w-8 rounded-full text-accent-fg flex items-center justify-center text-sm font-medium ring-1 ring-accent/30"
        style={{ background: 'linear-gradient(135deg, rgb(var(--c-accent-2)) 0%, rgb(var(--c-accent)) 100%)' }}
        title={user?.email}
      >
        {user?.email?.[0]?.toUpperCase() || 'A'}
      </div>
    </header>
  );
}
