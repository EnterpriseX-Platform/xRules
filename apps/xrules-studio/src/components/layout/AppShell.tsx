'use client';
// Carbon UI Shell: Header (areas in HeaderNavigation, tenant/project, search, user panel) +
// SideNav with the pages of the current area.
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Header, HeaderName, HeaderNavigation, HeaderMenuItem, HeaderGlobalBar, HeaderGlobalAction, HeaderPanel,
  HeaderMenuButton, Theme, SideNav, SideNavItems, SideNavLink, Switcher, SwitcherItem, SwitcherDivider,
} from '@carbon/react';
import { Search, UserAvatar, Asleep, Light } from '@carbon/icons-react';
import { CommandPalette } from './CommandPalette';
import { AssistantPanel } from '@/components/assistant/AssistantPanel';
import { ScopeBar } from './ScopeBar';
import { TenantSwitcher } from './TenantSwitcher';
import { ProjectPicker } from './ProjectPicker';
import { useNav } from './nav';
import { useAuth, useTheme } from '@/lib/store';

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { areas, area, activeHref, projects, current, setProject, perms } = useNav();
  const user = useAuth(s => s.user);
  const clear = useAuth(s => s.clear);
  const theme = useTheme(s => s.theme);
  const toggleTheme = useTheme(s => s.toggle);
  const [userOpen, setUserOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => { setUserOpen(false); setNavOpen(false); }, [activeHref]);
  useEffect(() => { document.body.classList.toggle('cds--g100', theme === 'dark'); document.body.classList.toggle('cds--g10', theme !== 'dark'); }, [theme]);

  const name = user?.name || user?.email?.split('@')[0] || '';
  const role = perms.role ? perms.role[0] + perms.role.slice(1).toLowerCase() : '';
  const projectArea = area.id === 'engine';

  return (
    <div className="h-screen overflow-hidden bg-bg">
      <Theme theme="g100">
      <Header aria-label="xRules">
        <HeaderMenuButton aria-label={navOpen ? 'Close menu' : 'Open menu'} isActive={navOpen} onClick={() => setNavOpen(o => !o)} />
        <HeaderName as={NextLink} href="/" prefix="">xRules</HeaderName>
        <HeaderNavigation aria-label="Areas">
          {areas.map(a => (
            <HeaderMenuItem key={a.id} as={NextLink} href={a.items[0]?.href ?? '/'} isActive={a.id === area.id}>{a.label}</HeaderMenuItem>
          ))}
        </HeaderNavigation>
        <HeaderGlobalBar>
          <div className="xr-context">
            <TenantSwitcher />
            {projectArea && current && <ProjectPicker projects={projects} current={current} onPick={p => setProject(p.id)} />}
          </div>
          <HeaderGlobalAction aria-label="Search" tooltipAlignment="end" onClick={() => window.dispatchEvent(new CustomEvent('xrules:open-palette'))}>
            <Search size={20} />
          </HeaderGlobalAction>
          <HeaderGlobalAction aria-label={theme === 'dark' ? 'Light theme' : 'Dark theme'} tooltipAlignment="end" onClick={toggleTheme}>
            {theme === 'dark' ? <Light size={20} /> : <Asleep size={20} />}
          </HeaderGlobalAction>
          <HeaderGlobalAction aria-label={`${name} ${role}`.trim()} isActive={userOpen} tooltipAlignment="end" onClick={() => setUserOpen(o => !o)}>
            <UserAvatar size={20} />
          </HeaderGlobalAction>
        </HeaderGlobalBar>
        <HeaderPanel expanded={userOpen} aria-label="User">
          {userOpen && <>
          <div className="xr-user">
            <div className="xr-user-name">{name}</div>
            <div className="xr-user-meta">{user?.email}</div>
            {role && <div className="xr-user-meta">{role}</div>}
          </div>
          <Switcher aria-label="User menu">
            <SwitcherDivider />
            <SwitcherItem aria-label="Tenant settings" onClick={() => router.push('/settings/tenant')}>Tenant settings</SwitcherItem>
            <SwitcherItem aria-label="Sign out" onClick={() => { clear(); qc.clear(); router.push('/login'); }}>Sign out</SwitcherItem>
          </Switcher>
          </>}
        </HeaderPanel>
      </Header>
      </Theme>
      <Theme theme={theme === 'dark' ? 'g100' : 'g10'}>
        <SideNav aria-label={area.label} expanded={navOpen} isPersistent onOverlayClick={() => setNavOpen(false)} onSideNavBlur={() => setNavOpen(false)}>
          <SideNavItems>
            <li className="xr-sidenav-title">{area.label}</li>
            {area.items.map(it => (
              <SideNavLink key={it.href} as={NextLink} href={it.href} isActive={it.href === activeHref}>{it.label}</SideNavLink>
            ))}
          </SideNavItems>
        </SideNav>
      </Theme>
      <main className="xr-content">
        <ScopeBar />
        {children}
      </main>
      <CommandPalette />
      <AssistantPanel />
    </div>
  );
}

export function PageHeader({
  title, description, actions, stats,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  stats?: { label: string; value: string | number }[];
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 mb-6">
      <div className="flex-1 min-w-[min(100%,360px)]">
        <h1 className="text-[28px] leading-9 font-normal text-text">{title}</h1>
        {description && <p className="text-subtle text-[14px] mt-1 max-w-[70ch]">{description}</p>}
        {stats && stats.length > 0 && (
          <div className="mt-2 text-[14px] text-subtle tabular-nums">
            {stats.map((s, i) => <span key={i}>{i > 0 && ' · '}{s.value} {s.label.toLowerCase()}</span>)}
          </div>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageContent({ children }: { children: React.ReactNode }) {
  return <div className="px-8 py-6 max-w-[1600px]">{children}</div>;
}
