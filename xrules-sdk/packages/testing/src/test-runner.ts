import { Rule, TestCase, TestResult, TestRun, TestSuite, Execution } from '@xrules/core';
import { evaluate } from '@xrules/formula-engine';
import { TestRunnerConfig, TestReport } from './types';

export class TestRunner {
  private config: TestRunnerConfig;

  constructor(config: Partial<TestRunnerConfig> = {}) {
    this.config = {
      parallel: false,
      maxConcurrency: 4,
      timeout: 30000,
      stopOnFailure: false,
      ...config,
    };
  }

  async runTests(
    suite: TestSuite,
    rule: Rule,
    evaluateFn: (input: Record<string, unknown>) => Promise<Execution>
  ): Promise<TestRun> {
    const run: TestRun = {
      id: `run_${Date.now()}`,
      testSuiteId: suite.id,
      status: 'running',
      results: [],
      startedAt: new Date(),
      summary: {
        total: suite.testCases.length,
        passed: 0,
        failed: 0,
        skipped: 0,
        errors: 0,
        duration: 0,
      },
    };

    const startTime = performance.now();

    try {
      if (this.config.parallel) {
        await this.runParallel(suite.testCases, rule, evaluateFn, run);
      } else {
        await this.runSequential(suite.testCases, rule, evaluateFn, run);
      }

      run.status = 'completed';
    } catch (error) {
      run.status = 'failed';
    }

    run.summary.duration = performance.now() - startTime;
    run.completedAt = new Date();

    return run;
  }

  private async runSequential(
    testCases: TestCase[],
    rule: Rule,
    evaluateFn: (input: Record<string, unknown>) => Promise<Execution>,
    run: TestRun
  ): Promise<void> {
    for (const testCase of testCases) {
      const result = await this.executeTestCase(testCase, evaluateFn);
      run.results.push(result);
      this.updateSummary(run.summary, result);

      if (this.config.stopOnFailure && result.status === 'failed') {
        break;
      }
    }
  }

  private async runParallel(
    testCases: TestCase[],
    rule: Rule,
    evaluateFn: (input: Record<string, unknown>) => Promise<Execution>,
    run: TestRun
  ): Promise<void> {
    const chunks = this.chunkArray(testCases, this.config.maxConcurrency);

    for (const chunk of chunks) {
      const promises = chunk.map((tc) => this.executeTestCase(tc, evaluateFn));
      const results = await Promise.all(promises);
      
      run.results.push(...results);
      results.forEach((r) => this.updateSummary(run.summary, r));

      if (this.config.stopOnFailure && results.some((r) => r.status === 'failed')) {
        break;
      }
    }
  }

  private async executeTestCase(
    testCase: TestCase,
    evaluateFn: (input: Record<string, unknown>) => Promise<Execution>
  ): Promise<TestResult> {
    const startTime = performance.now();

    try {
      const execution = await this.runWithTimeout(
        evaluateFn(testCase.input),
        this.config.timeout
      );

      const actualOutput = execution.output || {};
      const passed = this.compareOutputs(actualOutput, testCase.expectedOutput);

      return {
        testCaseId: testCase.id,
        status: passed ? 'passed' : 'failed',
        actualOutput,
        executionTime: performance.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        testCaseId: testCase.id,
        status: 'error',
        executionTime: performance.now() - startTime,
        timestamp: new Date(),
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          type: 'execution_error',
        },
      };
    }
  }

  private compareOutputs(
    actual: Record<string, unknown>,
    expected: Record<string, unknown>
  ): boolean {
    return JSON.stringify(actual) === JSON.stringify(expected);
  }

  private async runWithTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Test timeout')), timeout)
      ),
    ]);
  }

  private updateSummary(
    summary: TestRun['summary'],
    result: TestResult
  ): void {
    summary[result.status === 'passed' ? 'passed' : 
             result.status === 'failed' ? 'failed' : 
             result.status === 'error' ? 'errors' : 'skipped']++;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

export function createTestRunner(config?: Partial<TestRunnerConfig>): TestRunner {
  return new TestRunner(config);
}
