'use client';

import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from './CommandPalette';
import { Shortcuts } from './Shortcuts';
import { AssistantPanel } from '@/components/assistant/AssistantPanel';
import { ScopeBar } from './ScopeBar';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg">
      <Topbar />
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden bg-bg relative">
          <ScopeBar />
          {children}
        </main>
      </div>
      <CommandPalette />
      <Shortcuts />
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
        {/* page titles carry no explanation line */}
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
  return <div className="px-6 lg:px-8 pt-6 pb-24 max-w-[1600px] min-w-0">{children}</div>;
}
