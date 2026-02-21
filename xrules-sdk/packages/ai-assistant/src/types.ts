import { DecisionTable, DecisionTree, Rule } from '@xrules/core';

export interface AIAssistantConfig {
  provider: 'openai' | 'anthropic' | 'custom';
  apiKey: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GenerateRuleRequest {
  description: string;
  type: 'table' | 'tree' | 'expression';
  context?: string;
  inputs?: Array<{ name: string; type: string; description?: string }>;
  outputs?: Array<{ name: string; type: string; description?: string }>;
}

export interface GenerateRuleResponse {
  success: boolean;
  rule?: DecisionTable | DecisionTree | GeneratedExpression;
  explanation?: string;
  suggestions?: string[];
  error?: string;
}

export interface GeneratedExpression {
  type: 'expression';
  name: string;
  expression: string;
  variables: Array<{ name: string; type: string }>;
}

export interface ExplainRuleRequest {
  rule: Rule;
  detailLevel: 'simple' | 'detailed' | 'technical';
  language?: string;
}

export interface ExplainRuleResponse {
  success: boolean;
  explanation: string;
  decisionPath?: string[];
  examples?: Array<{ input: Record<string, unknown>; output: Record<string, unknown> }>;
  error?: string;
}

export interface OptimizeRuleRequest {
  rule: Rule;
  optimizationType: 'performance' | 'clarity' | 'coverage' | 'all';
  testCases?: Array<{ input: Record<string, unknown>; expected: Record<string, unknown> }>;
}

export interface OptimizeRuleResponse {
  success: boolean;
  suggestions: OptimizationSuggestion[];
  optimizedRule?: Rule;
  metrics?: {
    before: RuleMetrics;
    after: RuleMetrics;
  };
  error?: string;
}

export interface OptimizationSuggestion {
  type: 'performance' | 'clarity' | 'coverage' | 'best-practice';
  severity: 'low' | 'medium' | 'high';
  message: string;
  location?: string;
  suggestedChange?: string;
  autoFixable: boolean;
}

export interface RuleMetrics {
  complexity: number;
  coverage: number;
  readability: number;
  performance: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    ruleChanges?: boolean;
    testResults?: boolean;
  };
}

export interface ChatContext {
  ruleId?: string;
  projectId?: string;
  workspaceId?: string;
  currentRule?: Rule;
}

export interface AIAssistantState {
  messages: ChatMessage[];
  isLoading: boolean;
  context: ChatContext;
  suggestions: string[];
}

export type AIAction = 
  | { type: 'generate'; request: GenerateRuleRequest }
  | { type: 'explain'; request: ExplainRuleRequest }
  | { type: 'optimize'; request: OptimizeRuleRequest }
  | { type: 'chat'; message: string };
