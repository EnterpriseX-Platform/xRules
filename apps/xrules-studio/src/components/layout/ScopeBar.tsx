'use client';
// Tenant-level screens (Testing, Monitor) cover every project; this narrows them to one.
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import { Dropdown } from '@/components/pipeline/Dropdown';

const SECTIONS = /^\/projects\/([^/]+)\/(tests|test-runs|approvals|monitor|executions|audit)(\/|$)/;

export function ScopeBar() {
  const pathname = usePathname();
  const router = useRouter();
  const m = SECTIONS.exec(pathname);
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: projectsApi.list, enabled: !!m });
  if (!m) return null;
  const current = m[1];
  const options = [
    { value: '_all', label: 'All projects' },
    ...(projects as any[]).map(p => ({ value: p.slug || p.id, label: p.name })),
    ...(m[2].startsWith('monitor') || m[2] === 'approvals' || m[2] === 'tests' || m[2] === 'test-runs' ? [{ value: '_integration', label: 'Integration' }] : []),
  ];
  return (
    <div className="px-8 pt-5 -mb-2 flex items-center gap-3">
      <div className="text-[13px] text-[#525252]">Showing</div>
      <div className="w-64">
        <Dropdown value={current} options={options} onChange={v => router.push(pathname.replace(`/projects/${current}/`, `/projects/${v}/`).replace(new RegExp(`/projects/${current}$`), `/projects/${v}`))} />
      </div>
    </div>
  );
}
