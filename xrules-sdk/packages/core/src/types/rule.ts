/**
 * Rule Engine Types
 */

export interface Rule {
  id: string;
  name: string;
  description?: string;
  projectId: string;
  workspaceId: string;
  version: number;
  status: RuleStatus;
  type: RuleType;
  content: RuleContent;
  metadata?: RuleMetadata;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy?: string;
}

export type RuleStatus = 'draft' | 'active' | 'deprecated' | 'archived';

export type RuleType = 'decision-table' | 'decision-tree' | 'flow' | 'script' | 'template';

export type RuleContent = DecisionTableContent | DecisionTreeContent | FlowContent | ScriptContent;

export interface DecisionTableContent {
  type: 'decision-table';
  inputs: RuleInput[];
  outputs: RuleOutput[];
  rows: RuleRow[];
  hitPolicy: HitPolicy;
}

export interface DecisionTreeContent {
  type: 'decision-tree';
  nodes: DecisionNode[];
  edges: DecisionEdge[];
}

export interface FlowContent {
  type: 'flow';
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface ScriptContent {
  type: 'script';
  language: 'javascript' | 'python' | 'feel';
  code: string;
}

export interface RuleInput {
  id: string;
  name: string;
  label: string;
  type: string;
  required?: boolean;
  defaultValue?: unknown;
}

export interface RuleOutput {
  id: string;
  name: string;
  label: string;
  type: string;
}

export interface RuleRow {
  id: string;
  condition: string;
  action: string;
  priority: number;
  active: boolean;
}

export interface RuleMetadata {
  tags?: string[];
  category?: string;
  description?: string;
  documentation?: string;
  testCases?: string[];
}

export interface DecisionNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface DecisionEdge {
  id: string;
  source: string;
  target: string;
  condition?: string;
}

export interface FlowNode extends DecisionNode {}
export interface FlowEdge extends DecisionEdge {}

export type HitPolicy = 'first' | 'collect' | 'unique' | 'priority' | 'any';
