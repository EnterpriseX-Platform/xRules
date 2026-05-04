'use client';

import { Handle, Position, NodeProps } from 'reactflow';
import {
  LogIn, LogOut, Globe, Wand2, FileCode2, GitBranch, Database,
} from 'lucide-react';
import { cn } from '@/lib/cn';

const ICON: Record<string, any> = {
  input: LogIn,
  output: LogOut,
  http: Globe,
  transform: Wand2,
  ruleCall: FileCode2,
  branch: GitBranch,
  dbQuery: Database,
};

const TONE: Record<string, string> = {
  input:     'border-mint/40    bg-mint/5    text-mint',
  output:    'border-mint/40    bg-mint/5    text-mint',
  http:      'border-info/40    bg-info/5    text-info',
  dbQuery:   'border-info/40    bg-info/5    text-info',
  transform: 'border-warn/40    bg-warn/5    text-warn',
  ruleCall:  'border-accent/40  bg-accent/5  text-accent',
  branch:    'border-danger/40  bg-danger/5  text-danger',
};

function BaseNode({ data, type, hasInput = true, hasOutput = true, hasBranchOutputs = false }: any) {
  const Icon = ICON[type] || FileCode2;
  const tone = TONE[type] || 'border-border bg-surface text-text';
  const subtitle = nodeSubtitle(type, data);
  return (
    <div className={cn('rounded border-2 px-3 py-2 min-w-[170px] shadow-sm', tone)}>
      {hasInput && <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-subtle !border-0" />}
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5" />
        <span className="font-mono text-[10px] uppercase tracking-label">{labelFor(type)}</span>
      </div>
      <div className="text-sm font-medium text-text mt-1 truncate max-w-[160px]">
        {data?.label || labelFor(type)}
      </div>
      {subtitle && <div className="text-[10px] font-mono text-subtle truncate max-w-[160px] mt-0.5">{subtitle}</div>}
      {hasOutput && !hasBranchOutputs && <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-subtle !border-0" />}
      {hasBranchOutputs && (
        <>
          <Handle type="source" id="true"  position={Position.Right} style={{ top: '35%' }} className="!w-2 !h-2 !bg-ok !border-0" />
          <Handle type="source" id="false" position={Position.Right} style={{ top: '70%' }} className="!w-2 !h-2 !bg-danger !border-0" />
        </>
      )}
    </div>
  );
}

function labelFor(type: string) {
  return ({
    input: 'Input', output: 'Output', http: 'HTTP', transform: 'Transform',
    ruleCall: 'Rule Call', branch: 'Branch', dbQuery: 'DB Query',
  } as Record<string, string>)[type] || type;
}

function nodeSubtitle(type: string, data: any): string | undefined {
  if (!data) return undefined;
  if (type === 'http')      return data.url    ? `${(data.method || 'GET').toUpperCase()} ${data.url}` : undefined;
  if (type === 'ruleCall')  return data.ruleSlug ? `→ ${data.ruleSlug}` : undefined;
  if (type === 'transform') return data.expression ? truncate(data.expression, 30) : undefined;
  if (type === 'branch')    return data.condition ? truncate(data.condition, 30) : undefined;
  if (type === 'dbQuery')   return data.connectionId ? `conn: ${data.connectionId.slice(0, 8)}…` : undefined;
  return undefined;
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export const nodeTypes = {
  input:     (p: NodeProps) => <BaseNode {...p} hasInput={false} />,
  output:    (p: NodeProps) => <BaseNode {...p} hasOutput={false} />,
  http:      (p: NodeProps) => <BaseNode {...p} />,
  transform: (p: NodeProps) => <BaseNode {...p} />,
  ruleCall:  (p: NodeProps) => <BaseNode {...p} />,
  dbQuery:   (p: NodeProps) => <BaseNode {...p} />,
  branch:    (p: NodeProps) => <BaseNode {...p} hasBranchOutputs />,
};

export type NodeKind = keyof typeof nodeTypes;

export const PALETTE: { kind: NodeKind; label: string; tone: string }[] = [
  { kind: 'input',     label: 'Input',     tone: 'mint' },
  { kind: 'output',    label: 'Output',    tone: 'mint' },
  { kind: 'http',      label: 'HTTP',      tone: 'info' },
  { kind: 'dbQuery',   label: 'DB Query',  tone: 'info' },
  { kind: 'transform', label: 'Transform', tone: 'warn' },
  { kind: 'ruleCall',  label: 'Rule Call', tone: 'accent' },
  { kind: 'branch',    label: 'Branch',    tone: 'danger' },
];

export { ICON as NODE_ICONS, labelFor as nodeLabel };
