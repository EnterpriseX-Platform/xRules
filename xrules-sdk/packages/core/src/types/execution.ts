/**
 * Execution & Runtime Types
 */

export interface Execution {
  id: string;
  ruleId: string;
  projectId: string;
  workspaceId: string;
  status: ExecutionStatus;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  context?: ExecutionContext;
  trace?: ExecutionTrace;
  performance?: ExecutionPerformance;
  error?: ExecutionError;
  startedAt: Date;
  completedAt?: Date;
  createdBy?: string;
  source: ExecutionSource;
}

export type ExecutionStatus = 
  | 'pending' 
  | 'running' 
  | 'completed' 
  | 'failed' 
  | 'cancelled' 
  | 'timeout';

export type ExecutionSource = 
  | 'api' 
  | 'webhook' 
  | 'scheduler' 
  | 'manual' 
  | 'test' 
  | 'simulation';

export interface ExecutionContext {
  variables: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  requestId?: string;
  clientInfo?: ClientInfo;
}

export interface ClientInfo {
  ip?: string;
  userAgent?: string;
  source?: string;
}

export interface ExecutionTrace {
  steps: TraceStep[];
  nodesExecuted: string[];
  decisionsMade: DecisionPoint[];
}

export interface TraceStep {
  id: string;
  type: string;
  nodeId?: string;
  input: unknown;
  output?: unknown;
  startedAt: Date;
  completedAt?: Date;
  status: 'success' | 'error' | 'skipped';
  error?: string;
}

export interface DecisionPoint {
  stepId: string;
  condition: string;
  evaluatedTo: boolean;
  input: unknown;
  matchedRules?: string[];
}

export interface ExecutionPerformance {
  totalDuration: number;
  nodeDurations: Record<string, number>;
  memoryUsed?: number;
  cpuTime?: number;
}

export interface ExecutionError {
  code: string;
  message: string;
  stack?: string;
  nodeId?: string;
  stepId?: string;
}

export interface ExecutionMetrics {
  totalExecutions: number;
  successRate: number;
  avgDuration: number;
  p95Duration: number;
  p99Duration: number;
  errorsByType: Record<string, number>;
  executionsByDay: Record<string, number>;
}
