'use client';
// Rule Trace: every step in order, with status, time and what it produced. Sub-flows nest.
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { metaFor } from './registry';

const TONE: Record<string, string> = { ok: 'bg-[#a7f0ba] text-[#0e6027]', skipped: 'bg-[#e0e0e0] text-[#161616]', error: 'bg-[#ffd7d9] text-[#a2191f]' };
const WORD: Record<string, string> = { ok: 'ผ่าน', skipped: 'ข้าม', error: 'ผิดพลาด' };

export function TraceView({ steps, depth = 0 }: { steps: any[]; depth?: number }) {
  if (!Array.isArray(steps) || !steps.length) return <div className="text-[13px] text-[#525252]">ไม่มีร่องรอยแบบเต็มของการเรียกนี้ (เก็บเฉพาะสรุป)</div>;
  return <div className={depth ? 'border-l border-[#e0e0e0] ml-3 pl-3' : ''}>{steps.map((s, i) => <Step key={i} s={s} depth={depth} />)}</div>;
}

function Step({ s, depth }: { s: any; depth: number }) {
  const [open, setOpen] = useState(s.status !== 'ok' || !!s.children);
  const m = metaFor(s.kind === 'subflow' ? 'callDecisionFlow' : s.kind);
  const Icon = m.icon;
  const hasDetail = s.output !== undefined || s.input !== undefined || s.note || s.children;
  return (
    <div className="py-1">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 text-left h-8 hover:bg-[#e8e8e8] px-1" disabled={!hasDetail}>
        <ChevronRight className={`h-3.5 w-3.5 text-[#525252] transition-transform ${open ? 'rotate-90' : ''} ${hasDetail ? '' : 'opacity-0'}`} />
        <span className="font-mono text-[11px] text-[#6f6f6f] w-6 text-right">{s.seq}</span>
        <span className="h-5 w-5 flex items-center justify-center" style={{ background: m.tile }}><Icon className="h-3 w-3" style={{ color: m.ink }} /></span>
        <span className="text-[13px] font-semibold">{s.label || (s.kind === 'subflow' ? s.label : m.title)}</span>
        <span className="text-[11px] text-[#525252] tracking-[0.04em]">{m.label}</span>
        <span className={`ml-auto inline-flex h-5 items-center px-2 rounded-full text-[11px] ${TONE[s.status] || TONE.ok}`}>{WORD[s.status] || s.status}</span>
        <span className="font-mono text-[11px] text-[#525252] w-14 text-right">{s.ms} ms</span>
      </button>
      {open && hasDetail && (
        <div className="ml-9 mt-1 mb-2 space-y-1">
          {s.note && <div className="text-[12px] text-[#a2191f]">{s.note}</div>}
          {s.output !== undefined && <pre className="bg-[#f4f4f4] px-2 py-1 text-[11px] font-mono overflow-auto max-h-48">{JSON.stringify(s.output, null, 2)}</pre>}
          {s.children && <TraceView steps={s.children} depth={depth + 1} />}
        </div>
      )}
    </div>
  );
}
