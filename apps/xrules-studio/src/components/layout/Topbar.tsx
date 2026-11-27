'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Sparkles, Search, Sun, Moon, ChevronDown, ChevronRight, Settings, LogOut, Shield, Check } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme, useAuth, useProject } from '@/lib/store';
import { api, projectsApi } from '@/lib/api';
import { Logo } from '@/components/ui/Logo';
import { ProjectPicker } from './Sidebar';
import { TenantSwitcher } from './TenantSwitcher';
import { usePerms } from '@/lib/perms';
import { useDevMode } from '@/lib/devmode';

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const theme = useTheme((s) => s.theme);
  const toggle = useTheme((s) => s.toggle);
  const user = useAuth((s) => s.user);
  const clear = useAuth((s) => s.clear);
  const projectId = useProject((s) => s.currentProjectId);
  const setProject = useProject((s) => s.setCurrentProject);
  const perms = usePerms();
  const [dev, setDev] = useDevMode();
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: projectsApi.list, retry: false });
  const current = (projects as any[]).find((p: any) => p.id === projectId);
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as any)) setMenu(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api.get<any>('/auth/me'), staleTime: 60_000 });
  const isSys = !!(me as any)?.isSystemAdmin;
  const name = user?.name || user?.email?.split('@')[0] || '';
  const initials = name.slice(0, 2).toUpperCase() || 'A';
  const role = perms.role ? perms.role[0] + perms.role.slice(1).toLowerCase() : '';
  const tenantWide = !pathname.startsWith('/p/');

  return (
    <header className="h-[48px] shrink-0 bg-[#161616] text-[#c6c6c6] flex items-center border-b border-[#262626]">
      {/* brand block lines up with the sidebar column */}
      <button type="button" aria-label="Menu" className="md:hidden h-12 w-12 shrink-0 flex items-center justify-center text-white hover:bg-[#262626]" onClick={() => window.dispatchEvent(new CustomEvent('xrules:nav'))}>☰</button>
      <Link href="/projects" className="w-auto md:w-[220px] h-full shrink-0 flex items-center gap-2.5 px-4 text-white hover:bg-[#262626] border-r border-[#262626]" aria-label="xRules home">
        <Logo className="h-5 w-5 shrink-0" />
        <span className="text-[15px] font-semibold tracking-tight">xRules</span>
      </Link>
      <nav className="h-full flex items-center pl-2 min-w-0 shrink" aria-label="Location">
        {pathname.startsWith('/admin') ? <span className="h-8 px-2 flex items-center text-[14px] text-white">System admin</span> : <TenantSwitcher />}
        {!tenantWide && current && <>
          <ChevronRight className="h-4 w-4 text-[#6f6f6f] shrink-0" />
          <div className="w-52 min-w-0 [&>div>button>span:first-child]:hidden [&>div>button]:h-8 [&>div>button]:border-0 [&>div>button]:bg-transparent [&>div>button]:text-white [&>div>button:hover]:bg-[#262626] [&>div>button]:rounded-none">
            <ProjectPicker projects={projects as any[]} current={current} onPick={(p) => setProject(p.id)} />
          </div>
          {dev && <span className="pl-2 text-[12px] text-[#a8a8a8] whitespace-nowrap">Developer</span>}
        </>}
      </nav>

      <div className="flex-1 min-w-0 flex justify-center px-4">
        <button
          className="relative w-full max-w-[440px] hidden md:flex items-center pl-9 pr-12 text-left h-8 bg-[#262626] border border-[#393939] hover:border-[#525252]"
          onClick={() => window.dispatchEvent(new CustomEvent('xrules:open-palette'))}
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8d8d8d]" />
          <span className="text-[#8d8d8d] text-[13px] truncate whitespace-nowrap">Search rules, flows, APIs</span>
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 h-5 flex items-center text-[11px] text-[#a8a8a8] border border-[#393939] font-sans">⌘K</kbd>
        </button>
      </div>

      <button className="md:hidden h-12 w-12 flex items-center justify-center hover:bg-[#262626]" aria-label="Search"
        onClick={() => window.dispatchEvent(new CustomEvent('xrules:open-palette'))}><Search className="h-4 w-4" /></button>

      <button className="h-12 px-3 flex items-center gap-2 text-[13px] text-[#c6c6c6] hover:bg-[#262626] hover:text-white" title="Assistant (⌘;)"
        onClick={() => window.dispatchEvent(new CustomEvent('xrules:toggle-assistant'))}><Sparkles className="h-4 w-4" /><span className="hidden lg:inline">Assistant</span></button>

      <div className="relative h-full" ref={ref}>
        <button type="button" onClick={() => setMenu(m => !m)} aria-haspopup="menu" aria-expanded={menu}
          className="h-full flex items-center gap-2 pl-2 pr-3 hover:bg-[#262626] text-left">
          <span className="h-7 w-7 rounded-full bg-[#4589ff] text-white text-[11px] font-semibold flex items-center justify-center">{initials}</span>
          <span className="hidden xl:block leading-tight">
            <span className="block text-[13px] text-white max-w-[140px] truncate">{name}</span>
            {role && <span className="block text-[11px] text-[#a8a8a8]">{role}</span>}
          </span>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        {menu && (
          <div role="menu" className="absolute right-0 top-[48px] z-50 w-64 bg-[#262626] text-[#f4f4f4] border border-[#393939] shadow-xl">
            <div className="px-3 py-2.5 border-b border-[#393939]">
              <div className="text-[14px] truncate">{name}</div>
              <div className="text-[12px] text-[#a8a8a8] truncate">{user?.email}</div>
            </div>
            <div role="group" aria-label="View" className="py-1 border-b border-[#393939]">
              <div className="px-3 pt-1 pb-1 text-[12px] text-[#a8a8a8]">View</div>
              {([['Business', false], ['Developer', true]] as const).map(([l, v]) => (
                <button key={l} role="menuitemradio" aria-checked={dev === v} type="button" onClick={() => { setDev(v); setMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 h-9 text-[14px] hover:bg-[#393939] focus:bg-[#393939] focus:outline focus:outline-2 focus:outline-[#ffffff] focus:-outline-offset-2">
                  <span className="w-4 h-4 shrink-0">{dev === v && <Check className="h-4 w-4" />}</span>{l}
                </button>
              ))}
            </div>
            <button role="menuitem" type="button" onClick={() => { setMenu(false); router.push('/settings'); }} hidden={!perms.admin} className="w-full flex items-center gap-2 px-3 h-10 text-[14px] hover:bg-[#393939]"><Settings className="h-4 w-4" />Organization settings</button>
            {isSys && <button role="menuitem" type="button" onClick={() => { setMenu(false); router.push('/admin'); }} className="w-full flex items-center gap-2 px-3 h-10 text-[14px] hover:bg-[#393939]"><Shield className="h-4 w-4" />System admin</button>}
            <button role="menuitem" type="button" onClick={() => { clear(); qc.clear(); router.push('/login'); }} className="w-full flex items-center gap-2 px-3 h-10 text-[14px] hover:bg-[#393939]"><LogOut className="h-4 w-4" />Sign out</button>
          </div>
        )}
      </div>
    </header>
  );
}
