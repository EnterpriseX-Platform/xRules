import { TestCase, TestResult, TestRun, TestSuite } from '@xrules/core';

export interface TestRunnerConfig {
  parallel: boolean;
  maxConcurrency: number;
  timeout: number;
  stopOnFailure: boolean;
}

export interface CoverageConfig {
  includeRules: boolean;
  includeConditions: boolean;
  includePaths: boolean;
}

export interface TestReport {
  suite: TestSuite;
  run: TestRun;
  coverage?: CoverageReport;
  timestamp: Date;
  duration: number;
}

export interface CoverageReport {
  ruleId: string;
  lineCoverage: number;
  branchCoverage: number;
  pathCoverage: number;
  uncoveredLines: number[];
  uncoveredBranches: string[];
}

export interface SimulationScenario {
  name: string;
  description?: string;
  inputs: Record<string, unknown>;
  iterations?: number;
}

export interface SimulationResult {
  scenario: SimulationScenario;
  results: Array<{
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    executionTime: number;
  }>;
  statistics: {
    avgExecutionTime: number;
    minExecutionTime: number;
    maxExecutionTime: number;
    successRate: number;
  };
}

export { TestCase, TestResult, TestRun, TestSuite };
