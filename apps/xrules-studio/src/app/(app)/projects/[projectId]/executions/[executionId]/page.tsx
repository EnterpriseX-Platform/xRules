'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHead, Tag, fmtTime } from '@/components/pipeline/ui';

const SEV: Record<string, any> = { ERROR: 'red', WARNING: 'orange', SKIPPED: 'gray', INFO: 'blue' };

export default function ExecutionDetailPage() {
  const { projectId, executionId } = useParams<{ projectId: string; executionId: string }>();
  const { data: e } = useQuery({ queryKey: ['execution', executionId], queryFn: () => api.get<any>(`/data/executions/${executionId}`) });
  if (!e) return <div className="px-8 py-6" />;
  const out = e.output || {}; const findings: any[] = e.findings || out.findings || []; const lin = e.lineage || out.lineage || {};
  const s = out.summary || {};
  return (
    <div className="px-8 py-6">
      <PageHead title={`${e.name}${e.input?.context?.action ? ` · ${e.input.context.action}` : ''}`}
        sub={<>{fmtTime(e.createdAt)} · {e.duration} ms{e.environment ? ` · ${e.environment}` : ''}</>}
        actions={<div className="flex gap-2 items-center">{s.error ? <Tag tone="red">ERROR {s.error}</Tag> : <Tag tone="green">ผ่าน</Tag>}{s.warning ? <Tag tone="orange">WARNING {s.warning}</Tag> : null}{s.skipped ? <Tag>SKIPPED {s.skipped}</Tag> : null}</div>} />
      <div className="grid grid-cols-[1fr_360px] gap-4 items-start">
        <div className="bg-white">
          <div className="px-4 h-12 flex items-center text-[16px] border-b border-[#e0e0e0]">ผลตรวจที่ระบบปลายทางได้รับ</div>
          {findings.length === 0 && <div className="px-4 py-6 text-[14px] text-[#525252]">ไม่พบข้อผิดพลาด</div>}
          {findings.map((f, i) => (
            <div key={i} className="px-4 py-3 border-b border-[#e0e0e0] flex gap-4">
              <div className="w-[88px] shrink-0"><Tag tone={SEV[f.severity] || 'gray'}>{f.severity}</Tag></div>
              <div className="min-w-0">
                <div className="font-mono text-[12px] text-[#525252]">{[f.ruleCode, f.lineId, f.fileId, f.field].filter(Boolean).join(' · ')}</div>
                <div className="text-[14px] text-[#161616]">{f.message}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="bg-white">
          <div className="px-4 h-12 flex items-center text-[16px] border-b border-[#e0e0e0]">ที่มาของข้อมูล</div>
          <div className="px-4 py-3 space-y-2 text-[14px]">
            <div className="flex justify-between gap-2"><span className="text-[#525252]">Flow</span><span className="font-mono text-[13px]">{lin.flow || `${e.slug}@${e.flowVersion}`}</span></div>
            {Object.entries(lin.datasets || {}).map(([k, v]: any) => (
              <div key={k} className="flex justify-between gap-2"><span className="text-[#525252] truncate">{k}</span>
                <span className="flex items-center gap-2 font-mono text-[13px]">{String(v).startsWith('v') ? v : fmtTime(v)}{(lin.stale || []).includes(k) && <Tag tone="orange">stale</Tag>}</span></div>
            ))}
            {(lin.stale || []).length > 0 && <div className="text-[12px] text-[#525252] pt-1">stale = รอบล่าสุดของ Data Flow ล้ม จึงใช้รอบก่อน</div>}
          </div>
          <details className="border-t border-[#e0e0e0]"><summary className="px-4 h-12 flex items-center text-[14px] text-[#0f62fe] cursor-pointer">Input JSON</summary>
            <pre className="px-4 pb-4 text-[12px] font-mono overflow-x-auto">{JSON.stringify(e.input, null, 2)}</pre></details>
        </div>
      </div>
    </div>
  );
}
