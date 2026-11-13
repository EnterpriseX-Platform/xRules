'use client';

import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from './CommandPalette';
import { AssistantPanel } from '@/components/assistant/AssistantPanel';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-bg relative">
          {children}
        </main>
      </div>
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
