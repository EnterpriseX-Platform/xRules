'use client';
// Step types for the pipeline editor (Data Flows and Decision Flows).
import {
  Clock, Database, Shuffle, Filter, Combine, ShieldCheck, Layers, BellRing,
  LogIn, Search, FileCheck2, FileCode2, CheckCheck, GitBranch, Split, Merge, Wand2, LogOut, Globe,
  ArrowDownToLine, ArrowUpFromLine, Workflow, Webhook, Hand, KeyRound,
} from 'lucide-react';

export type FlowKindName = 'data' | 'decision' | 'integration' | 'api' | 'trigger';

export interface StepMeta {
  kind: string;            // node.type
  label: string;           // KIND caption on the card
  title: string;           // default title
  icon: any;
  tile: string;            // icon tile background
  ink: string;             // icon colour
  locked?: boolean;        // first/last step: cannot be removed
  group: string;
  flows: FlowKindName[];
  sub?: (d: any) => string | undefined;
}

const short = (s: any, n = 28) => (s == null ? undefined : String(s).length > n ? String(s).slice(0, n) + '…' : String(s));

export const STEPS: StepMeta[] = [
  // ---- Data Flow
  { kind: 'trigger',  label: 'TRIGGER',   title: 'Schedule',       icon: Clock,       tile: '#161616', ink: '#ffffff', locked: true, group: 'Start',     flows: ['data'], sub: d => d?.cron || 'manual' },
  { kind: 'source',   label: 'SOURCE',    title: 'Source',         icon: Database,    tile: '#d0e2ff', ink: '#0043ce', group: 'Source',    flows: ['data'], sub: d => d?.connection ? `${d.connection} · ${d.sql ? 'SQL' : d.path ? 'HTTP' : ''}` : d?.file ? 'file' : undefined },
  { kind: 'map',      label: 'TRANSFORM', title: 'Map fields',     icon: Shuffle,     tile: '#e8daff', ink: '#6929c4', group: 'Transform', flows: ['data'], sub: d => d?.fields ? `${Object.keys(d.fields).length} fields` : undefined },
  { kind: 'filter',   label: 'TRANSFORM', title: 'Filter',         icon: Filter,      tile: '#e8daff', ink: '#6929c4', group: 'Transform', flows: ['data'], sub: d => short(d?.expression) },
  { kind: 'join',     label: 'TRANSFORM', title: 'Join Data Set',  icon: Combine,     tile: '#e8daff', ink: '#6929c4', group: 'Transform', flows: ['data'], sub: d => d?.dataset },
  { kind: 'quality',  label: 'QUALITY',   title: 'Quality checks', icon: ShieldCheck, tile: '#ffd8bd', ink: '#8a3800', group: 'Quality',   flows: ['data'], sub: d => `${(d?.checks || []).length} checks` },
  { kind: 'write',    label: 'TARGET',    title: 'Write Data Set', icon: Layers,      tile: '#a7f0ba', ink: '#0e6027', group: 'Target',    flows: ['data'], sub: d => d?.dataset },
  { kind: 'notify',   label: 'ON FAIL',   title: 'Notify',         icon: BellRing,    tile: '#ffd7d9', ink: '#a2191f', group: 'Target',    flows: ['data'], sub: d => short(d?.url) },
  // ---- REST API operation
  { kind: 'apiInput',    label: 'API INPUT',    title: 'API Input',     icon: ArrowDownToLine, tile: '#161616', ink: '#ffffff', locked: true, group: 'Input / Output', flows: ['api'], sub: d => d?.label },
  { kind: 'apiResponse', label: 'API RESPONSE', title: 'API Response',  icon: ArrowUpFromLine, tile: '#e0e0e0', ink: '#161616', group: 'Input / Output', flows: ['api'], sub: d => `status ${d?.status ?? 200}` },
  // ---- Trigger
  { kind: 'trigger',     label: 'TRIGGER',      title: 'Trigger',       icon: Clock,     tile: '#161616', ink: '#ffffff', locked: true, group: 'Start', flows: ['trigger'],
    sub: d => d?.type === 'webhook' ? 'Webhook' : d?.type === 'manual' ? 'กดรันเอง' : d?.cron ? `ตามรอบ ${d.cron}` : 'ตามรอบ' },
  // ---- shared by API / Trigger / Decision
  { kind: 'callDecisionFlow', label: 'DECISION', title: 'เรียก Decision Flow', icon: Workflow, tile: '#d0e2ff', ink: '#0043ce', group: 'Decision', flows: ['api', 'trigger'], sub: d => d?.flow },
  { kind: 'lookup',      label: 'LOOKUP',       title: 'ค้น Data Set',  icon: Search,    tile: '#a7f0ba', ink: '#0e6027', group: 'Decision', flows: ['api', 'trigger'], sub: d => d?.dataset },
  // ---- Decision / Integration Flow
  { kind: 'input',     label: 'TRIGGER',    title: 'API call',      icon: LogIn,       tile: '#161616', ink: '#ffffff', locked: true, group: 'Start', flows: ['decision', 'integration'], sub: () => 'REST · API key' },
  { kind: 'enrich',    label: 'ENRICH',     title: 'Enrichment',    icon: Search,      tile: '#a7f0ba', ink: '#0e6027', group: 'Data',  flows: ['decision', 'integration'], sub: d => d?.dataset },
  { kind: 'filecheck', label: 'FILE CHECK', title: 'File Check',    icon: FileCheck2,  tile: '#a7f0ba', ink: '#0e6027', group: 'Data',  flows: ['decision', 'integration'], sub: d => d?.ruleCode || 'templates' },
  { kind: 'http',      label: 'HTTP',       title: 'HTTP call',     icon: Globe,       tile: '#d0e2ff', ink: '#0043ce', group: 'Data',  flows: ['decision', 'integration', 'api', 'trigger'], sub: d => short(d?.url) },
  { kind: 'ruleCall',  label: 'RULE',       title: 'Rule',          icon: FileCode2,   tile: '#d0e2ff', ink: '#0043ce', group: 'Logic', flows: ['decision', 'integration', 'api', 'trigger'], sub: d => d?.ruleCode || d?.ruleSlug },
  { kind: 'parallel',  label: 'PARALLEL',   title: 'Run together',  icon: Split,       tile: '#e8daff', ink: '#6929c4', group: 'Logic', flows: ['decision', 'integration'] },
  { kind: 'merge',     label: 'MERGE',      title: 'Merge',         icon: Merge,       tile: '#e8daff', ink: '#6929c4', group: 'Logic', flows: ['decision', 'integration'] },
  { kind: 'branch',    label: 'BRANCH',     title: 'Branch',        icon: GitBranch,   tile: '#ffd8bd', ink: '#8a3800', group: 'Logic', flows: ['decision', 'integration', 'api', 'trigger'], sub: d => short(d?.condition) },
  { kind: 'transform', label: 'TRANSFORM',  title: 'Transform',     icon: Wand2,       tile: '#e8daff', ink: '#6929c4', group: 'Logic', flows: ['decision', 'integration', 'api', 'trigger'], sub: d => d?.target },
  { kind: 'findings',  label: 'OUTPUT',     title: 'Findings',      icon: CheckCheck,  tile: '#e0e0e0', ink: '#161616', locked: true, group: 'End', flows: ['decision', 'integration'], sub: () => 'ERROR · WARNING' },
  { kind: 'output',    label: 'OUTPUT',     title: 'Output',        icon: LogOut,      tile: '#e0e0e0', ink: '#161616', locked: true, group: 'End', flows: ['decision', 'integration'] },
];

export const STEP_BY_KIND: Record<string, StepMeta> = Object.fromEntries(STEPS.map(s => [s.kind, s]));
STEP_BY_KIND.rulecall = STEP_BY_KIND.ruleCall;
STEP_BY_KIND.fanout = STEP_BY_KIND.parallel;
STEP_BY_KIND.assign = STEP_BY_KIND.transform;
STEP_BY_KIND.apiinput = STEP_BY_KIND.apiInput;
STEP_BY_KIND.apiresponse = STEP_BY_KIND.apiResponse;
STEP_BY_KIND.calldecisionflow = STEP_BY_KIND.callDecisionFlow;

export function metaFor(kind?: string): StepMeta {
  return STEP_BY_KIND[kind || ''] || { kind: kind || 'step', label: String(kind || 'STEP').toUpperCase(), title: kind || 'Step', icon: FileCode2, tile: '#e0e0e0', ink: '#161616', group: 'Other', flows: [] };
}
