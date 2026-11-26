'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard, FolderKanban, FileText, Brain, FlaskConical,
  Activity, KeyRound, Plug, Webhook, ScrollText, Settings,
  ChevronDown, Workflow, Briefcase, ListTree, Zap,
  Database, Layers, Network, BookA, Rows3, GitCompare, BadgeCheck, Timer, ListChecks, Gauge, PieChart, HeartPulse, Bell, History,
  UserCog, Lock, Box, Building2, Shield, ChevronLeft,
} from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { useProject } from '@/lib/store';
import { useQuery } from '@tanstack/react-query';
import { projectsApi, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { usePerms } from '@/lib/perms';
import { useDevMode } from '@/lib/devmode';

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
  // phones: the menu is a drawer opened from the top bar
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => { const t = () => setNavOpen(o => !o); window.addEventListener('xrules:nav', t); return () => window.removeEventListener('xrules:nav', t); }, []);
  const pathname = usePathname();
  const router = useRouter();
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
    const fromUrl = pathname.match(/^\/p\/([^/]+)/)?.[1];
    const urlProject = fromUrl && projects.find((p: any) => p.id === fromUrl || p.slug === fromUrl);
    // an old link with the project's slug: show the CUID in the address bar instead
    if (urlProject && fromUrl !== urlProject.id) router.replace(pathname.replace(`/p/${fromUrl}`, `/p/${urlProject.id}`) + window.location.search);
    if (urlProject && urlProject.id !== project) { setProject(urlProject.id); return; }
    if (!project || !projects.some((p: any) => p.id === project)) setProject(projects[0].id);
  }, [projects, project, setProject, pathname]);

  const currentProject = projects?.find((p: any) => p.id === project);
  const projBase = `/p/${currentProject?.id || project || '_'}`;

  const perms = usePerms();
  const [dev, setDev] = useDevMode();

  // Which level the page belongs to: system (/admin), project (/p/<cuid>) or organization (everything else)
  const level: 'system' | 'project' | 'org' = pathname.startsWith('/admin') ? 'system' : pathname.startsWith('/p/') ? 'project' : 'org';
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api.get<any>('/auth/me'), staleTime: 60_000 });

  let areas: { id: string; label: string; items: NavItem[] }[] = [];
  let title = '';
  let foot: NavItem | null = null;
  if (level === 'system') {
    title = 'System admin';
    areas = [{ id: 'sys', label: '', items: [
      { href: '/admin/orgs', label: 'Organizations', icon: Building2 },
      { href: '/admin/users', label: 'Users', icon: UserCog },
      { href: '/admin/settings', label: 'Settings', icon: Settings },
    ] }];
    foot = { href: '/projects', label: 'Back to app', icon: ChevronLeft };
  } else if (level === 'project') {
    title = currentProject?.name || '';
    areas = [
      { id: 'engine', label: '', items: [
        { href: `${projBase}/topics`,              label: 'Topics',         icon: FolderKanban },
        { href: `${projBase}/vocabulary`,          label: 'Words',          icon: BookA },
        { href: `${projBase}/approvals`,           label: 'Approvals',      icon: ScrollText },
      ] },
      ...(dev ? [{ id: 'dev', label: 'Developer', items: [
        { href: `${projBase}/rules`,               label: 'Rules',          icon: FileText },
        { href: `${projBase}/flows?kind=DECISION`, label: 'Decision Flows', icon: Workflow },
        { href: `${projBase}/bulk`,                label: 'Bulk Runs',      icon: Rows3 },
        { href: `${projBase}/simulations`,         label: 'Simulations',    icon: GitCompare },
        { href: `${projBase}/models`,              label: 'Models',         icon: Box },
        { href: `${projBase}/releases`,            label: 'Releases',       icon: ScrollText },
      ] }] : []),
      ...(perms.admin ? [{ id: 'pset', label: '', items: [{ href: `${projBase}/access`, label: 'Project settings', icon: Lock }] }] : []),
    ];
    foot = { href: '/projects', label: 'Organization', icon: ChevronLeft };
  } else {
    title = '';
    areas = [
      { id: 'home', label: '', items: [
        { href: '/projects', label: 'Projects', icon: FolderKanban },
        { href: '/', label: 'Home', icon: LayoutDashboard },
      ] },
      ...(!perms.integrate || !dev ? [] : [{ id: 'shared', label: 'Shared', items: [
        { href: '/apis',        label: 'REST APIs',   icon: Zap },
        { href: '/triggers',    label: 'Triggers',    icon: Timer },
        { href: '/data-sets',   label: 'Data Sets',   icon: Layers },
        { href: '/connections', label: 'Connections', icon: Database },
      ] }]),
      { id: 'testing', label: 'Testing', items: [
        { href: '/tests',     label: 'Test Suites', icon: FlaskConical },
        { href: '/test-runs', label: 'Test Runs',   icon: ListChecks },
        { href: '/approvals', label: 'Approvals',   icon: BadgeCheck },
      ] },
      ...((!perms.integrate && !perms.admin) || !dev ? [] : [{ id: 'monitor', label: 'Monitor', items: [
        { href: '/monitor',             label: 'Overview',    icon: Gauge },
        { href: '/monitor/traffic',     label: 'API Traffic', icon: Activity },
        { href: '/monitor/decisions',   label: 'Decisions',   icon: PieChart },
        { href: '/monitor/data-health', label: 'Data Health', icon: HeartPulse },
        { href: '/monitor/alerts',      label: 'Alerts',      icon: Bell },
        { href: '/executions',          label: 'Executions',  icon: History },
      ] }])
    ];
    if (perms.admin) foot = { href: '/settings', label: 'Organization settings', icon: Settings };
  }
  ALL_ITEMS = [];
  areas.forEach(a => a.items.forEach(it => ALL_ITEMS.push(it)));
  if (foot) ALL_ITEMS.push(foot);
  void me;
  // narrow screens: icons only
  return (
    <>
    {navOpen && <div className="fixed inset-0 top-12 z-30 bg-[#161616]/40 md:hidden" onClick={() => setNavOpen(false)} />}
    <aside onClick={e => { if ((e.target as HTMLElement).closest('a')) setNavOpen(false); }}
      className={cn('shrink-0 w-[220px] bg-[#f4f4f4] border-r border-[#e0e0e0] flex-col overflow-y-auto overflow-x-hidden',
        navOpen ? 'flex fixed top-12 bottom-0 left-0 z-40 md:static' : 'hidden md:flex')}>
      {title && <div className="px-4 pt-4 pb-2 text-[14px] font-semibold text-[#161616] truncate">{title}</div>}
      <div className="flex-1 py-2">
        {areas.map((a, i) => (
          <div key={a.id} className={cn(i > 0 && 'mt-3 pt-3 border-t border-[#e0e0e0] md:border-0 md:pt-0')}>
            {a.label && <div className="px-4 pb-1 text-[12px] text-[#6f6f6f]">{a.label}</div>}
            {a.items.map(it => <NavRow key={it.href} item={it} pathname={pathname} />)}
          </div>
        ))}
      </div>
      {level !== 'system' && (
        <label className="h-10 px-4 flex items-center gap-3 text-[13px] text-[#525252] border-t border-[#e0e0e0] cursor-pointer select-none">
          <input type="checkbox" className="sr-only peer" checked={dev} onChange={e => setDev(e.target.checked)} />
          <span aria-hidden className={`relative w-8 h-4 rounded-full transition-colors ${dev ? 'bg-[#0f62fe]' : 'bg-[#8d8d8d]'}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${dev ? 'left-[18px]' : 'left-0.5'}`} /></span>
          Developer view
        </label>
      )}
      {foot && (
        <div className="py-2 border-t border-[#e0e0e0]">
          <NavRow item={foot} pathname={pathname} />
        </div>
      )}
    </aside>
    </>
  );
}

function NavSection({ id, label, items, pathname }: {
  id: string; label: string; items: NavItem[]; pathname: string;
}) {
  const here = items.some(it => it.href.split('?')[0] !== '/' && pathname.startsWith(it.href.split('?')[0]));
  const [open, setOpen] = useState<boolean>(() => {
    try { const v = localStorage.getItem(`xrules-nav-${id}`); return v === null ? true : v === '1'; } catch { return true; }
  });
  useEffect(() => { if (here) setOpen(true); }, [here]);
  if (!items.length) return null;
  const toggle = () => setOpen(o => { try { localStorage.setItem(`xrules-nav-${id}`, o ? '0' : '1'); } catch {} return !o; });
  return (
    <div className="space-y-0.5">
      <button type="button" onClick={toggle} aria-expanded={open}
        className="w-full px-4 pt-1 pb-0.5 flex items-center justify-between text-[12px] font-semibold text-[#525252] hover:text-[#161616]">
        <span>{label}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !open && '-rotate-90')} />
      </button>
      {open && <div className="px-2">{items.map((it) => <NavRow key={it.href} item={it} pathname={pathname} />)}</div>}
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
  // pages inside the Integration hub without their own menu item (an API operation's flow) belong to REST APIs
  if (!best && pathname.startsWith('/apis/')) return '/apis';
  if (!best && pathname.startsWith('/settings')) return '/settings';
  if (!best && pathname.startsWith('/projects')) return '/projects';
  return best?.href ?? null;
}

function NavRow({ item, pathname }: { item: NavItem; pathname: string }) {
  if (!ALL_ITEMS.includes(item) && !ALL_ITEMS.some(i => i.href === item.href)) ALL_ITEMS.push(item);
  const active = bestHref(pathname) === item.href;
  const Icon = item.icon;
  return (
    <Link href={item.href} title={item.label} className={cn('nav-row', active && 'nav-row-active')}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
    </Link>
  );
}

export function ProjectPicker({ projects, current, onPick }: {
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
    router.push(`/p/${p.id}/topics`);
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
