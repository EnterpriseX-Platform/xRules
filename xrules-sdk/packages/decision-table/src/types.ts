import { DecisionTable, DecisionRule, HitPolicy } from '@xrules/core';

export interface DecisionTableProps {
  table: DecisionTable;
  onChange?: (table: DecisionTable) => void;
  readOnly?: boolean;
  height?: number | string;
  className?: string;
}

export interface DecisionTableEditorProps extends DecisionTableProps {
  onSave?: (table: DecisionTable) => void;
  onValidate?: (table: DecisionTable) => ValidationResult[];
}

export interface ValidationResult {
  rowIndex: number;
  columnId: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface CellValue {
  value: string;
  isValid: boolean;
  errorMessage?: string;
}

export interface ColumnDef {
  id: string;
  name: string;
  label: string;
  type: 'input' | 'output';
  dataType: string;
  editable: boolean;
  width?: number;
}

export interface RowData {
  id: string;
  rowNumber: number;
  [key: string]: string | number;
}

export interface HitPolicyOption {
  value: HitPolicy;
  label: string;
  description: string;
}

export interface EvaluationContext {
  variables: Record<string, unknown>;
  functions?: Record<string, Function>;
}

export interface EvaluationResult {
  matched: boolean;
  rules: MatchedRule[];
  outputs?: Record<string, unknown>;
  trace: EvaluationTrace;
}

export interface MatchedRule {
  ruleId: string;
  rowNumber: number;
  outputs: Record<string, unknown>;
}

export interface EvaluationTrace {
  steps: TraceStep[];
  duration: number;
}

export interface TraceStep {
  rowNumber: number;
  condition: string;
  evaluated: boolean;
  matched: boolean;
  duration: number;
}

export { DecisionTable, DecisionRule, HitPolicy };
