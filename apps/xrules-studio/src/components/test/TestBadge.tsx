'use client';
// "Tests 3/4 passed" beside Publish; click opens the test cases.
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function TestBadge({ targetType, targetId, onOpen }: { targetType: string; targetId: string; onOpen?: () => void }) {
  const { data: cases = [] } = useQuery({ queryKey: ['test-sheet', targetType, targetId], queryFn: () => api.get<any[]>(`/platform/tests/target/${targetType}/${targetId}`), enabled: !!targetId });
  const total = cases.length; const pass = cases.filter((c: any) => c.lastStatus === 'PASS').length;
  const ran = cases.some((c: any) => c.lastStatus && c.lastStatus !== 'PENDING');
  const tone = !total ? 'text-[#525252]' : pass === total ? 'text-[#198038]' : ran ? 'text-[#da1e28]' : 'text-[#525252]';
  return (
    <button type="button" onClick={onOpen} className={`h-8 px-3 text-[13px] hover:bg-[#e8e8e8] tabular-nums ${tone}`}>
      {!total ? 'No test cases' : `Tests ${pass}/${total} passed`}
    </button>
  );
}
