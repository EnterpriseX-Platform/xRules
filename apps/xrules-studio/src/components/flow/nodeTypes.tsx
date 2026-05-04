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
  // Phase 3 additions (DR-aligned)
  assign: Wand2,
  switch: GitBranch,
  declare: FileCode2,
  globals: FileCode2,
  foreach: FileCode2,
  sticky: FileCode2,
  end: LogOut,
  dynamicRule: FileCode2,
  aiAgent: FileCode2,
  append: FileCode2,
  join: FileCode2,
  collect: FileCode2,
  debug: FileCode2,
  customCode: FileCode2,
  dbQuerySingle: Database,
};

const TONE: Record<string, string> = {
  input:         'border-mint/40    bg-mint/5    text-mint',
  output:        'border-mint/40    bg-mint/5    text-mint',
  end:           'border-mint/40    bg-mint/5    text-mint',
  http:          'border-info/40    bg-info/5    text-info',
  dbQuery:       'border-info/40    bg-info/5    text-info',
  dbQuerySingle: 'border-info/40    bg-info/5    text-info',
  transform:     'border-warn/40    bg-warn/5    text-warn',
  assign:        'border-warn/40    bg-warn/5    text-warn',
  declare:       'border-warn/40    bg-warn/5    text-warn',
  globals:       'border-warn/40    bg-warn/5    text-warn',
  foreach:       'border-warn/40    bg-warn/5    text-warn',
  ruleCall:      'border-accent/40  bg-accent/5  text-accent',
  dynamicRule:   'border-accent/40  bg-accent/5  text-accent',
  aiAgent:       'border-accent/40  bg-accent/5  text-accent',
  append:        'border-accent/40  bg-accent/5  text-accent',
  join:          'border-accent/40  bg-accent/5  text-accent',
  collect:       'border-accent/40  bg-accent/5  text-accent',
  customCode:    'border-accent/40  bg-accent/5  text-accent',
  branch:        'border-danger/40  bg-danger/5  text-danger',
  switch:        'border-danger/40  bg-danger/5  text-danger',
  debug:         'border-subtle/40  bg-muted/30  text-subtle',
  sticky:        'border-subtle/40  bg-muted/30  text-subtle',
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
    assign: 'Assign', switch: 'Switch', declare: 'Declare', globals: 'Globals',
    foreach: 'Foreach', sticky: 'Sticky Note', end: 'End',
    dynamicRule: 'Dynamic Rule', aiAgent: 'AI Agent',
    append: 'Append', join: 'Join', collect: 'Collect',
    debug: 'Debug', customCode: 'Custom Code', dbQuerySingle: 'DB Single Row',
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
  input:         (p: NodeProps) => <BaseNode {...p} hasInput={false} />,
  output:        (p: NodeProps) => <BaseNode {...p} hasOutput={false} />,
  end:           (p: NodeProps) => <BaseNode {...p} hasOutput={false} />,
  http:          (p: NodeProps) => <BaseNode {...p} />,
  transform:     (p: NodeProps) => <BaseNode {...p} />,
  assign:        (p: NodeProps) => <BaseNode {...p} />,
  declare:       (p: NodeProps) => <BaseNode {...p} />,
  globals:       (p: NodeProps) => <BaseNode {...p} hasInput={false} />,
  foreach:       (p: NodeProps) => <BaseNode {...p} />,
  sticky:        (p: NodeProps) => <BaseNode {...p} hasInput={false} hasOutput={false} />,
  ruleCall:      (p: NodeProps) => <BaseNode {...p} />,
  dynamicRule:   (p: NodeProps) => <BaseNode {...p} />,
  aiAgent:       (p: NodeProps) => <BaseNode {...p} />,
  append:        (p: NodeProps) => <BaseNode {...p} />,
  join:          (p: NodeProps) => <BaseNode {...p} />,
  collect:       (p: NodeProps) => <BaseNode {...p} />,
  debug:         (p: NodeProps) => <BaseNode {...p} />,
  customCode:    (p: NodeProps) => <BaseNode {...p} />,
  dbQuery:       (p: NodeProps) => <BaseNode {...p} />,
  dbQuerySingle: (p: NodeProps) => <BaseNode {...p} />,
  branch:        (p: NodeProps) => <BaseNode {...p} hasBranchOutputs />,
  switch:        (p: NodeProps) => <BaseNode {...p} hasBranchOutputs />,
};

export type NodeKind = keyof typeof nodeTypes;

export const PALETTE_GROUPS: { group: string; items: { kind: NodeKind; label: string; tone: string }[] }[] = [
  {
    group: 'I/O',
    items: [
      { kind: 'input',  label: 'Input',  tone: 'mint' },
      { kind: 'output', label: 'Output', tone: 'mint' },
      { kind: 'end',    label: 'End',    tone: 'mint' },
      { kind: 'sticky', label: 'Note',   tone: 'subtle' as any },
    ],
  },
  {
    group: 'Variables',
    items: [
      { kind: 'assign',  label: 'Assign',  tone: 'warn' },
      { kind: 'declare', label: 'Declare', tone: 'warn' },
      { kind: 'globals', label: 'Globals', tone: 'warn' },
    ],
  },
  {
    group: 'Logic',
    items: [
      { kind: 'branch',  label: 'Branch',  tone: 'danger' },
      { kind: 'switch',  label: 'Switch',  tone: 'danger' },
      { kind: 'foreach', label: 'Foreach', tone: 'warn' },
    ],
  },
  {
    group: 'Rules',
    items: [
      { kind: 'ruleCall',    label: 'Rule Call',     tone: 'accent' },
      { kind: 'dynamicRule', label: 'Dynamic Rule',  tone: 'accent' },
      { kind: 'aiAgent',     label: 'AI Agent',      tone: 'accent' },
    ],
  },
  {
    group: 'Data',
    items: [
      { kind: 'http',          label: 'HTTP',          tone: 'info' },
      { kind: 'dbQuery',       label: 'DB Query',      tone: 'info' },
      { kind: 'dbQuerySingle', label: 'DB Single Row', tone: 'info' },
      { kind: 'transform',     label: 'Transform',     tone: 'warn' },
    ],
  },
  {
    group: 'Array',
    items: [
      { kind: 'append',  label: 'Append',  tone: 'accent' },
      { kind: 'join',    label: 'Join',    tone: 'accent' },
      { kind: 'collect', label: 'Collect', tone: 'accent' },
    ],
  },
  {
    group: 'Advanced',
    items: [
      { kind: 'debug',      label: 'Debug',       tone: 'subtle' as any },
      { kind: 'customCode', label: 'Custom Code', tone: 'accent' },
    ],
  },
];

// Flat for legacy callers
export const PALETTE = PALETTE_GROUPS.flatMap(g => g.items);

export { ICON as NODE_ICONS, labelFor as nodeLabel };
