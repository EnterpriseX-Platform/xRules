/**
 * Testing Framework Types
 */

export interface TestSuite {
  id: string;
  name: string;
  description?: string;
  ruleId: string;
  testCases: TestCase[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TestCase {
  id: string;
  name: string;
  description?: string;
  input: Record<string, unknown>;
  expectedOutput: Record<string, unknown>;
  expectedOutcome?: 'pass' | 'fail';
  tags?: string[];
}

export interface TestResult {
  testCaseId: string;
  status: TestStatus;
  actualOutput?: Record<string, unknown>;
  executionTime: number;
  timestamp: Date;
  error?: TestError;
  coverage?: CoverageReport;
}

export type TestStatus = 'passed' | 'failed' | 'error' | 'skipped';

export interface TestError {
  message: string;
  stack?: string;
  type: string;
}

export interface TestRun {
  id: string;
  testSuiteId: string;
  status: 'running' | 'completed' | 'failed';
  results: TestResult[];
  startedAt: Date;
  completedAt?: Date;
  summary: TestSummary;
}

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  errors: number;
  duration: number;
  coverage?: number;
}

export interface CoverageReport {
  ruleId: string;
  linesCovered: number;
  linesTotal: number;
  coverage: number;
  uncoveredLines: number[];
  branches?: BranchCoverage[];
}

export interface BranchCoverage {
  condition: string;
  covered: boolean;
}

export interface SimulationRequest {
  ruleId: string;
  input: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface SimulationResult {
  success: boolean;
  output?: Record<string, unknown>;
  executionTrace: ExecutionStep[];
  executionTime: number;
  error?: string;
}

export interface ExecutionStep {
  step: number;
  nodeId?: string;
  type: string;
  input: unknown;
  output?: unknown;
  timestamp: Date;
  duration: number;
}
