/**
 * Decision Model Types
 * Supports Decision Table, Decision Tree, and Decision Flow
 */

export type DecisionType = 'table' | 'tree' | 'flow' | 'expression';

export interface DecisionModel {
  id: string;
  name: string;
  description?: string;
  type: DecisionType;
  version: number;
  status: 'draft' | 'active' | 'archived';
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  tags?: string[];
}

/**
 * Decision Table Types
 */
export interface DecisionTable extends DecisionModel {
  type: 'table';
  inputs: DecisionInput[];
  outputs: DecisionOutput[];
  rules: DecisionRule[];
  hitPolicy: HitPolicy;
}

export type HitPolicy = 'unique' | 'first' | 'collect' | 'ruleOrder' | 'any' | 'priority';

export interface DecisionInput {
  id: string;
  name: string;
  label: string;
  type: DataType;
  expression: string; // FEEL expression
}

export interface DecisionOutput {
  id: string;
  name: string;
  label: string;
  type: DataType;
}

export interface DecisionRule {
  id: string;
  rowNumber: number;
  description?: string;
  inputEntries: InputEntry[];
  outputEntries: OutputEntry[];
}

export interface InputEntry {
  inputId: string;
  value: string; // FEEL expression or '-'
}

export interface OutputEntry {
  outputId: string;
  value: string;
}

export type DataType = 
  | 'string' 
  | 'number' 
  | 'boolean' 
  | 'date' 
  | 'time' 
  | 'dateTime' 
  | 'duration' 
  | 'list' 
  | 'context';

/**
 * Decision Tree Types
 */
export interface DecisionTree extends DecisionModel {
  type: 'tree';
  rootNode: TreeNode;
  nodes: TreeNode[];
}

export interface TreeNode {
  id: string;
  type: 'decision' | 'outcome' | 'branch';
  name: string;
  condition?: string; // FEEL expression for decision nodes
  outcome?: Record<string, unknown>; // For outcome nodes
  children: string[]; // Node IDs
  parentId?: string;
  position?: { x: number; y: number };
}

/**
 * Decision Expression (Formula)
 */
export interface DecisionExpression extends DecisionModel {
  type: 'expression';
  expression: string; // FEEL expression
  context: Record<string, DecisionVariable>;
  resultType: DataType;
}

export interface DecisionVariable {
  name: string;
  type: DataType;
  value?: unknown;
  expression?: string;
}
