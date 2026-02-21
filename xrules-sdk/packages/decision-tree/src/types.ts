import { DecisionTree, TreeNode } from '@xrules/core';

export interface DecisionTreeProps {
  tree: DecisionTree;
  onChange?: (tree: DecisionTree) => void;
  readOnly?: boolean;
  height?: number | string;
  className?: string;
}

export interface DecisionTreeEditorProps extends DecisionTreeProps {
  onSave?: (tree: DecisionTree) => void;
  onNodeSelect?: (node: TreeNode) => void;
}

export interface TreeNodeComponentProps {
  node: TreeNode;
  selected?: boolean;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onAddChild?: () => void;
}

export interface NodeEditorProps {
  node: TreeNode;
  onSave: (updates: Partial<TreeNode>) => void;
  onCancel: () => void;
}

export interface EvaluationResult {
  path: TreeNode[];
  outcome?: Record<string, unknown>;
  matched: boolean;
  trace: EvaluationStep[];
}

export interface EvaluationStep {
  nodeId: string;
  condition: string;
  evaluated: boolean;
  matched: boolean;
}

export { DecisionTree, TreeNode };
