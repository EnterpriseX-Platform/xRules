'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FolderKanban,
  Settings,
  User,
  LogOut,
  ChevronRight,
  Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';
import { useWorkspaceStore } from '@/stores/workspace-store';

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { currentWorkspace } = useWorkspaceStore();

  const isWorkspaceRoute = pathname.includes('/workspaces/');
  const workspaceId = isWorkspaceRoute
    ? pathname.split('/workspaces/')[1]?.split('/')[0]
    : null;

  const mainNavItems = [
    {
      title: 'Dashboard',
      href: '/studio',
      icon: LayoutDashboard,
    },
    {
      title: 'Workspaces',
      href: '/studio/workspaces',
      icon: Building2,
    },
  ];

  const workspaceNavItems = workspaceId
    ? [
        {
          title: 'Overview',
          href: `/studio/workspaces/${workspaceId}`,
          icon: LayoutDashboard,
        },
        {
          title: 'Projects',
          href: `/studio/workspaces/${workspaceId}/projects`,
          icon: FolderKanban,
        },
        {
          title: 'Settings',
          href: `/studio/workspaces/${workspaceId}/settings`,
          icon: Settings,
        },
      ]
    : [];

  return (
    <div
      className={cn(
        'flex h-screen w-64 flex-col border-r bg-card',
        className
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <span className="text-lg font-bold text-primary-foreground">X</span>
          </div>
          <span className="text-lg font-semibold">xrules</span>
        </Link>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-auto py-4">
        {/* Main Navigation */}
        <nav className="space-y-1 px-3">
          {mainNavItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.title}
              </Link>
            );
          })}
        </nav>

        {/* Workspace Navigation */}
        {workspaceId && currentWorkspace && (
          <>
            <div className="mt-6 px-3">
              <div className="flex items-center gap-2 px-3 text-xs font-medium text-muted-foreground">
                <ChevronRight className="h-3 w-3" />
                {currentWorkspace.name}
              </div>
            </div>
            <nav className="mt-2 space-y-1 px-3">
              {workspaceNavItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.title}
                  </Link>
                );
              })}
            </nav>
          </>
        )}
      </div>

      {/* User Section */}
      <div className="border-t p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary">
            <span className="text-sm font-medium text-primary-foreground">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </span>
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-medium">{user?.name || 'User'}</p>
            <p className="truncate text-xs text-muted-foreground">
              {user?.email || ''}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
