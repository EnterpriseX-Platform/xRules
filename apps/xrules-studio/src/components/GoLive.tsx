'use client';
// The one button that takes a change live. With approval on (the default) it requests approval;
// approving publishes. With approval off it publishes directly.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, tenantApi } from '@/lib/api';

export function GoLive({ targetType, targetId, reviewState, onPublish, publishing, disabled, publishLabel = 'Publish', invalidate = [] }: {
  targetType: 'rule' | 'decision_flow' | 'api_spec'; targetId: string; reviewState?: string | null;
  onPublish: () => void; publishing?: boolean; disabled?: boolean; publishLabel?: string; invalidate?: any[][];
}) {
  const qc = useQueryClient();
  const { data: t } = useQuery({ queryKey: ['tenant'], queryFn: tenantApi.current, staleTime: 60_000 });
  const required = (t as any)?.requireApproval !== false;
  const request = useMutation({
    mutationFn: () => api.post('/platform/reviews', { targetType, targetId }),
    onSuccess: () => { invalidate.forEach(k => qc.invalidateQueries({ queryKey: k })); qc.invalidateQueries({ queryKey: ['reviews'] }); },
  });
  const state = String(reviewState || '').toUpperCase();
  const btn = 'h-10 px-4 text-[14px] bg-[#0f62fe] text-white hover:bg-[#0353e9] whitespace-nowrap disabled:bg-[#c6c6c6] flex items-center gap-2';

  if (!required) return <button type="button" className={btn} disabled={disabled || publishing} onClick={onPublish}>{publishLabel}</button>;
  if (state === 'PENDING') return (
    <span className="h-10 px-3 inline-flex items-center gap-2 text-[14px] text-[#0043ce] bg-[#edf5ff] whitespace-nowrap">
      <span className="h-1.5 w-1.5 rounded-full bg-current" />In review
    </span>
  );
  return (
    <span className="inline-flex items-center gap-2">
      {state === 'REJECTED' && <span className="text-[13px] text-[#a2191f] whitespace-nowrap">Sent back</span>}
      <button type="button" className={btn} disabled={disabled || request.isPending} onClick={() => request.mutate()} title={request.error ? String((request.error as any).message) : undefined}>
        Request approval
      </button>
    </span>
  );
}
