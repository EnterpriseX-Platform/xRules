'use client';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Lock } from 'lucide-react';
import { metaFor, STEP_BY_KIND } from './registry';

const port = '!w-[10px] !h-[10px] !bg-white !border-[1.5px] !border-[#161616] !rounded-full';

export function PipelineNode({ type, data, selected }: NodeProps) {
  const m = metaFor(type);
  const Icon = m.icon;
  const sub = data?.subtitle ?? m.sub?.(data);
  const failed = data?.__status === 'error';
  return (
    <div
      className="relative bg-white flex items-center gap-3 pl-3 pr-4 h-[72px] w-[240px]"
      style={{ border: `${selected ? 2 : 1}px solid ${selected ? '#0f62fe' : failed ? '#da1e28' : '#c6c6c6'}` }}
    >
      <Handle type="target" position={Position.Left} id="l" className={port} />
      <Handle type="target" position={Position.Top} id="t" className={port} />
      <div className="h-10 w-10 shrink-0 flex items-center justify-center" style={{ background: m.tile }}>
        <Icon className="h-5 w-5" style={{ color: m.ink }} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] tracking-[0.06em] text-[#525252]">{m.label}</div>
        <div className="text-[14px] font-semibold text-[#161616] truncate">{data?.label || m.title}</div>
        {sub && <div className="text-[12px] text-[#525252] truncate">{sub}</div>}
      </div>
      {m.locked && (
        <div className="absolute -top-2.5 -right-2.5 h-5 w-5 rounded-full bg-white border border-[#c6c6c6] flex items-center justify-center" title="Cannot be removed">
          <Lock className="h-3 w-3 text-[#525252]" />
        </div>
      )}
      {type === 'branch' ? (
        <>
          <Handle type="source" position={Position.Right} id="true" style={{ top: '35%' }} className={port} />
          <Handle type="source" position={Position.Right} id="false" style={{ top: '70%' }} className={port} />
        </>
      ) : (
        <Handle type="source" position={Position.Right} id="r" className={port} />
      )}
      <Handle type="source" position={Position.Bottom} id="b" className={port} />
    </div>
  );
}

// every known step kind (plus legacy kinds) renders with the same card
const LEGACY = ['assign', 'switch', 'declare', 'globals', 'foreach', 'sticky', 'end', 'dynamicRule', 'aiAgent', 'append', 'collect', 'debug', 'customCode', 'dbQuery', 'dbQuerySingle', 'rulecall', 'fanout'];
export const pipelineNodeTypes: Record<string, typeof PipelineNode> = Object.fromEntries([...Object.keys(STEP_BY_KIND), ...LEGACY].map(k => [k, PipelineNode]));
