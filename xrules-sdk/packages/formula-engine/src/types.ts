export interface ExpressionContext {
  variables: Record<string, unknown>;
  functions?: Record<string, Function>;
}

export interface ParseResult {
  success: boolean;
  ast?: ExpressionNode;
  error?: string;
}

export interface EvaluationResult {
  success: boolean;
  value?: unknown;
  error?: string;
  type?: string;
}

export type ExpressionNode =
  | LiteralNode
  | VariableNode
  | BinaryOpNode
  | UnaryOpNode
  | FunctionCallNode
  | ListNode
  | ContextNode;

export interface LiteralNode {
  type: 'literal';
  value: string | number | boolean | null;
  dataType: string;
}

export interface VariableNode {
  type: 'variable';
  name: string;
}

export interface BinaryOpNode {
  type: 'binaryOp';
  operator: string;
  left: ExpressionNode;
  right: ExpressionNode;
}

export interface UnaryOpNode {
  type: 'unaryOp';
  operator: string;
  operand: ExpressionNode;
}

export interface FunctionCallNode {
  type: 'functionCall';
  name: string;
  args: ExpressionNode[];
}

export interface ListNode {
  type: 'list';
  items: ExpressionNode[];
}

export interface ContextNode {
  type: 'context';
  entries: Array<{ key: string; value: ExpressionNode }>;
}
