'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Plus, Settings, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useProjects } from '@/hooks/use-projects';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface HeaderProps {
  className?: string;
}

export function Header({ className }: HeaderProps) {
  const pathname = usePathname();
  const { currentWorkspace, workspaces, setCurrentWorkspace } = useWorkspaceStore();

  const workspaceId = pathname.split('/workspaces/')[1]?.split('/')[0];
  const projectId = pathname.split('/projects/')[1]?.split('/')[0];

  const { data: projects, isLoading: projectsLoading } = useProjects(
    workspaceId || ''
  );

  const currentProject = projects?.find((p) => p.id === projectId);

  const breadcrumbs = [];

  if (workspaceId && currentWorkspace) {
    breadcrumbs.push({
      label: currentWorkspace.name,
      href: `/workspaces/${workspaceId}`,
    });

    if (projectId) {
      if (projectsLoading) {
        breadcrumbs.push({
          label: 'Loading...',
          href: pathname,
        });
      } else if (currentProject) {
        breadcrumbs.push({
          label: currentProject.name,
          href: `/workspaces/${workspaceId}/projects/${projectId}`,
        });
      }

      if (pathname.includes('/rules')) {
        const ruleId = pathname.split('/rules/')[1]?.split('/')[0];
        if (ruleId) {
          breadcrumbs.push({
            label: 'Rules',
            href: `/workspaces/${workspaceId}/projects/${projectId}/rules`,
          });
          breadcrumbs.push({
            label: 'Editor',
            href: pathname,
            isCurrent: true,
          });
        } else {
          breadcrumbs.push({
            label: 'Rules',
            href: pathname,
            isCurrent: true,
          });
        }
      }
    }
  }

  return (
    <header
      className={cn(
        'flex h-16 items-center justify-between border-b bg-card px-6',
        className
      )}
    >
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-sm">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground"
        >
          Home
        </Link>

        {breadcrumbs.length > 0 && (
          <>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            {breadcrumbs.map((crumb, index) => (
              <span key={crumb.href} className="flex items-center gap-2">
                {index > 0 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                {crumb.isCurrent ? (
                  <span className="font-medium">{crumb.label}</span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {crumb.label}
                  </Link>
                )}
              </span>
            ))}
          </>
        )}
      </nav>

      {/* Right Section */}
      <div className="flex items-center gap-4">
        {/* Workspace Switcher */}
        {workspaces.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                {currentWorkspace?.name || 'Select Workspace'}
                <ChevronRight className="h-4 w-4 rotate-90" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                Switch Workspace
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {workspaces.map((workspace) => (
                <DropdownMenuItem
                  key={workspace.id}
                  onClick={() => setCurrentWorkspace(workspace)}
                  className={cn(
                    'cursor-pointer',
                    currentWorkspace?.id === workspace.id && 'bg-accent'
                  )}
                >
                  <div className="flex items-center justify-between w-full">
                    <span>{workspace.name}</span>
                    {currentWorkspace?.id === workspace.id && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        Current
                      </Badge>
                    )}
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
        </Button>

        {/* Settings */}
        <Button variant="ghost" size="icon" asChild>
          <Link href="/settings">
            <Settings className="h-5 w-5" />
          </Link>
        </Button>
      </div>
    </header>
  );
}
