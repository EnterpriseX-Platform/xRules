'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Search, Sun, Moon, ChevronDown, Settings, LogOut, Shield } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme, useAuth, useProject } from '@/lib/store';
import { api, projectsApi } from '@/lib/api';
import { Logo } from '@/components/ui/Logo';
import { ProjectPicker } from './Sidebar';
import { TenantSwitcher } from './TenantSwitcher';
import { usePerms } from '@/lib/perms';

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
  const tenantWide = /^\/projects\/(_all|_integration)\b/.test(pathname) || pathname.startsWith('/settings') || pathname.startsWith('/admin');

  return (
    <header className="h-[48px] shrink-0 bg-[#161616] text-[#c6c6c6] flex items-center pr-2">
      <Link href="/" className="w-[52px] h-full flex items-center justify-center text-white hover:bg-[#393939]" aria-label="xRules home"><Logo className="h-5 w-5" /></Link>
      <span className="text-[14px] font-semibold text-white pr-4">xRules</span>
      <div className="h-full flex items-center border-l border-[#393939] pl-1 pr-2 gap-0.5 min-w-0">
        <TenantSwitcher />
        {!tenantWide && current && <>
          <span className="text-[#6f6f6f] px-0.5">›</span>
          <div className="w-56 min-w-0 [&>div>button>span:first-child]:hidden [&>div>button]:h-8 [&>div>button]:border-0 [&>div>button]:bg-transparent [&>div>button]:text-white [&>div>button:hover]:bg-[#393939] [&>div>button]:rounded-none">
            <ProjectPicker projects={projects as any[]} current={current} onPick={(p) => setProject(p.id)} />
          </div>
        </>}
      </div>

      <button
        className="ml-4 mr-auto relative w-80 min-w-0 shrink hidden lg:flex items-center pl-9 pr-14 text-left h-8 bg-[#393939] hover:bg-[#474747]"
        onClick={() => window.dispatchEvent(new CustomEvent('xrules:open-palette'))}
      >
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#c6c6c6]" />
        <span className="text-[#c6c6c6] text-[13px] truncate whitespace-nowrap">Search rules, flows, APIs</span>
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-[#a8a8a8]">⌘K</span>
      </button>

      <button className="h-10 w-10 flex items-center justify-center hover:bg-[#393939] text-[#c6c6c6]" onClick={toggle} aria-label="Toggle theme">
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div className="relative h-full border-l border-[#393939]" ref={ref}>
        <button type="button" onClick={() => setMenu(m => !m)} aria-haspopup="menu" aria-expanded={menu}
          className="h-full flex items-center gap-2 px-3 hover:bg-[#393939] text-left">
          <span className="h-7 w-7 rounded-full bg-[#4589ff] text-white text-[11px] font-semibold flex items-center justify-center">{initials}</span>
          <span className="hidden sm:block leading-tight">
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
            <button role="menuitem" type="button" onClick={() => { setMenu(false); router.push('/settings/tenant'); }} className="w-full flex items-center gap-2 px-3 h-10 text-[14px] hover:bg-[#393939]"><Settings className="h-4 w-4" />Organization settings</button>
            {isSys && <button role="menuitem" type="button" onClick={() => { setMenu(false); router.push('/admin'); }} className="w-full flex items-center gap-2 px-3 h-10 text-[14px] hover:bg-[#393939]"><Shield className="h-4 w-4" />System admin</button>}
            <button role="menuitem" type="button" onClick={() => { clear(); qc.clear(); router.push('/login'); }} className="w-full flex items-center gap-2 px-3 h-10 text-[14px] hover:bg-[#393939]"><LogOut className="h-4 w-4" />Sign out</button>
          </div>
        )}
      </div>
    </header>
  );
}
