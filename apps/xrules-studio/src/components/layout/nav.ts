'use client';
// Areas and their pages — one source for the Carbon header navigation (areas) and side nav (pages of the area).
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import { useProject } from '@/lib/store';
import { usePerms } from '@/lib/perms';

export interface NavItem { href: string; label: string }
export interface Area { id: string; label: string; items: NavItem[] }

export function useNav() {
  const pathname = usePathname();
  const project = useProject(s => s.currentProjectId);
  const setProject = useProject(s => s.setCurrentProject);
  const perms = usePerms();
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: projectsApi.list, retry: false });

  // follow the project in the URL; drop a stored project that no longer exists
  useEffect(() => {
    if (!projects.length) return;
    const fromUrl = pathname.match(/^\/projects\/([^/]+)/)?.[1];
    const urlProject = fromUrl && (projects as any[]).find(p => p.id === fromUrl || p.slug === fromUrl);
    if (urlProject && urlProject.id !== project) { setProject(urlProject.id); return; }
    if (!project || !(projects as any[]).some(p => p.id === project)) setProject((projects as any[])[0].id);
  }, [projects, project, setProject, pathname]);

  const current = (projects as any[]).find(p => p.id === project);
  const P = `/projects/${current?.slug || project || '_'}`;
  const HUB = '/projects/_integration', ALL = '/projects/_all';

  const areas: Area[] = [
    { id: 'engine', label: 'Decision Engine', items: [
      { href: '/', label: 'Dashboard' },
      ...(project ? [
        { href: `${P}/rules`, label: 'Rules' },
        { href: `${P}/flows?kind=DECISION`, label: 'Decision Flows' },
        { href: `${P}/vocabulary`, label: 'Vocabulary' },
        { href: `${P}/bulk`, label: 'Bulk Runs' },
        { href: `${P}/simulations`, label: 'Simulations' },
        { href: `${P}/models`, label: 'Models' },
        { href: `${P}/releases`, label: 'Releases' },
      ] : []),
    ] },
    { id: 'integration', label: 'Integration', items: [
      { href: `${HUB}/apis`, label: 'REST APIs' },
      { href: `${HUB}/triggers`, label: 'Triggers' },
      { href: `${HUB}/data-sets`, label: 'Data Sets' },
      { href: `${HUB}/integrations/connections`, label: 'Connections' },
    ] },
    { id: 'testing', label: 'Testing', items: [
      { href: `${ALL}/tests`, label: 'Test Suites' },
      { href: `${ALL}/test-runs`, label: 'Test Runs' },
      { href: `${ALL}/approvals`, label: 'Approvals' },
    ] },
    { id: 'monitor', label: 'Monitor', items: [
      { href: `${ALL}/monitor`, label: 'Overview' },
      { href: `${ALL}/monitor/traffic`, label: 'API Traffic' },
      { href: `${ALL}/monitor/decisions`, label: 'Decisions' },
      { href: `${ALL}/monitor/data-health`, label: 'Data Health' },
      { href: `${ALL}/monitor/alerts`, label: 'Alerts' },
      { href: `${ALL}/executions`, label: 'Executions' },
    ] },
    ...(perms.admin ? [{ id: 'admin', label: 'Admin', items: [
      { href: '/settings/tenant?tab=Members', label: 'Members & Roles' },
      { href: '/projects', label: 'Projects' },
      ...(project ? [{ href: `${P}/access`, label: 'Project Access' }] : []),
      { href: `${HUB}/integrations/api-keys`, label: 'API Keys' },
      { href: `${ALL}/audit`, label: 'Audit Log' },
      { href: '/settings/tenant', label: 'Tenant' },
    ] }] : []),
  ];

  // the item that best matches the URL (longest path; ?kind= and ?tab= break ties)
  const search = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  let activeHref: string | null = null; let best = -1;
  for (const a of areas) for (const it of a.items) {
    const [path, qs] = it.href.split('?');
    if (!(pathname === path || (path !== '/' && pathname.startsWith(path + '/')))) continue;
    const q = new URLSearchParams(qs || '');
    let score = path.length * 4;
    for (const [k, v] of Array.from(q.entries())) { if ((search.get(k) || '').toLowerCase() === v.toLowerCase()) score += 2; else score -= 1; }
    if (score > best) { best = score; activeHref = it.href; }
  }
  const area = areas.find(a => a.items.some(i => i.href === activeHref)) ?? areas[0];
  return { areas, area, activeHref, projects: projects as any[], current, setProject, perms };
}
