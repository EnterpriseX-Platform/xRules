'use client';
// Tab strip shared by Test Suites / Datasets / Simulations / Bench.
// They sit at separate routes but read as one feature — "Test".
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const TABS = [
  { key: 'test-suites', label: 'Suites'      },
  { key: 'datasets',    label: 'Datasets'    },
  { key: 'simulations', label: 'Simulations' },
  { key: 'bench',       label: 'Bench'       },
] as const;

export function TestNav() {
  const { projectId } = useParams<{ projectId: string }>();
  const pathname = usePathname();
  return (
    <div className="tabs-row mb-5">
      {TABS.map((t) => {
        const href = `/projects/${projectId}/${t.key}`;
        const active = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link key={t.key} href={href} className={cn('tab', active && 'tab-active')}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
