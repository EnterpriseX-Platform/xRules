/**
 * NodeExecutor
 * Execution engine interface and utilities for running node logic
 */

import {
  NodeContext,
  NodeInputs,
  NodeOutputs,
  NodeConfig,
  Logger,
  ExecutionInfo,
  LogEntry,
} from '../types/node';
import NodeDefinition from './NodeDefinition';

/**
 * Executor configuration options
 */
export interface ExecutorConfig {
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  enableLogging?: boolean;
  onLog?: (entry: LogEntry) => void;
  onProgress?: (progress: number, message?: string) => void;
}

/**
 * Execution result
 */
export interface ExecutionResult {
  success: boolean;
  outputs: NodeOutputs;
  logs: LogEntry[];
  executionTime: number;
  retries: number;
  error?: Error;
}

/**
 * Execution state
 */
export interface ExecutionState {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentStep?: string;
  startTime?: Date;
  endTime?: Date;
  error?: Error;
}

/**
 * Default logger implementation
 */
class DefaultLogger implements Logger {
  private entries: LogEntry[] = [];
  private onLog?: (entry: LogEntry) => void;

  constructor(onLog?: (entry: LogEntry) => void) {
    this.onLog = onLog;
  }

  private log(level: LogEntry['level'], message: string, metadata?: Record<string, any>): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      metadata,
    };
    this.entries.push(entry);
    this.onLog?.(entry);
  }

  debug(message: string, metadata?: Record<string, any>): void {
    this.log('debug', message, metadata);
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.log('info', message, metadata);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.log('warn', message, metadata);
  }

  error(message: string, metadata?: Record<string, any>): void {
    this.log('error', message, metadata);
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }
}

/**
 * Simple HTTP client for node execution
 */
class SimpleHttpClient {
  async get<T = any>(url: string, config?: any): Promise<T> {
    const response = await fetch(url, { method: 'GET', ...config });
    return response.json();
  }

  async post<T = any>(url: string, data?: any, config?: any): Promise<T> {
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
      ...config,
    });
    return response.json();
  }

  async put<T = any>(url: string, data?: any, config?: any): Promise<T> {
    const response = await fetch(url, {
      method: 'PUT',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
      ...config,
    });
    return response.json();
  }

  async patch<T = any>(url: string, data?: any, config?: any): Promise<T> {
    const response = await fetch(url, {
      method: 'PATCH',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
      ...config,
    });
    return response.json();
  }

  async delete<T = any>(url: string, config?: any): Promise<T> {
    const response = await fetch(url, { method: 'DELETE', ...config });
    return response.json();
  }

  async request<T = any>(config: any): Promise<T> {
    const { url, ...rest } = config;
    const response = await fetch(url, rest);
    return response.json();
  }
}

/**
 * Simple secrets manager
 */
class SimpleSecretsManager {
  private secrets: Map<string, string> = new Map();

  async get(key: string): Promise<string | undefined> {
    return this.secrets.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    this.secrets.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.secrets.delete(key);
  }

  async list(): Promise<string[]> {
    return Array.from(this.secrets.keys());
  }
}

/**
 * NodeExecutor - handles node execution with retries, timeouts, and logging
 */
export class NodeExecutor {
  private config: ExecutorConfig;
  private state: ExecutionState = { status: 'idle', progress: 0 };
  private cancelled = false;
  private cancelCallbacks: Array<() => void> = [];

  constructor(config: ExecutorConfig = {}) {
    this.config = {
      timeout: 30000,
      maxRetries: 0,
      retryDelay: 1000,
      enableLogging: true,
      ...config,
    };
  }

  /**
   * Execute a node definition
   */
  async execute(
    definition: NodeDefinition | NodeConfig,
    properties: Record<string, any>,
    inputs: NodeInputs,
    executionInfo: Partial<ExecutionInfo> = {}
  ): Promise<ExecutionResult> {
    const nodeDef = definition instanceof NodeDefinition 
      ? definition 
      : new NodeDefinition(definition);

    const startTime = Date.now();
    const logs: LogEntry[] = [];
    let retries = 0;

    // Reset state
    this.cancelled = false;
    this.cancelCallbacks = [];
    this.state = {
      status: 'running',
      progress: 0,
      startTime: new Date(),
    };

    // Create logger
    const logger = new DefaultLogger((entry) => {
      logs.push(entry);
      this.config.onLog?.(entry);
    });

    // Create context
    const context = this.createContext(properties, logger, executionInfo);

    // Execute with retries
    while (retries <= (this.config.maxRetries || 0)) {
      try {
        logger.info(`Executing node "${nodeDef.name}" (attempt ${retries + 1})`);

        // Initialize node
        await nodeDef.init(context);

        // Execute with timeout
        const outputs = await this.executeWithTimeout(nodeDef, context, inputs);

        // Cleanup
        await nodeDef.destroy(context);

        // Update state
        this.state = {
          ...this.state,
          status: 'completed',
          progress: 100,
          endTime: new Date(),
        };

        logger.info(`Node "${nodeDef.name}" executed successfully`);

        return {
          success: true,
          outputs,
          logs,
          executionTime: Date.now() - startTime,
          retries,
        };

      } catch (error: any) {
        logger.error(`Execution failed: ${error.message}`, { error: error.stack });

        // Check if cancelled
        if (this.cancelled) {
          this.state.status = 'cancelled';
          return {
            success: false,
            outputs: {},
            logs,
            executionTime: Date.now() - startTime,
            retries,
            error: new Error('Execution cancelled'),
          };
        }

        // Retry logic
        if (retries < (this.config.maxRetries || 0)) {
          retries++;
          logger.info(`Retrying in ${this.config.retryDelay}ms...`);
          await this.delay(this.config.retryDelay || 1000);
        } else {
          // No more retries
          this.state = {
            ...this.state,
            status: 'failed',
            endTime: new Date(),
            error,
          };

          return {
            success: false,
            outputs: {},
            logs,
            executionTime: Date.now() - startTime,
            retries,
            error,
          };
        }
      }
    }

    // Should not reach here
    return {
      success: false,
      outputs: {},
      logs,
      executionTime: Date.now() - startTime,
      retries,
      error: new Error('Unexpected execution end'),
    };
  }

  /**
   * Cancel the current execution
   */
  cancel(): void {
    this.cancelled = true;
    this.cancelCallbacks.forEach((cb) => cb());
  }

  /**
   * Get current execution state
   */
  getState(): ExecutionState {
    return { ...this.state };
  }

  /**
   * Check if execution is cancelled
   */
  isCancelled(): boolean {
    return this.cancelled;
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout(
    definition: NodeDefinition,
    context: NodeContext,
    inputs: NodeInputs
  ): Promise<NodeOutputs> {
    const timeout = this.config.timeout || 30000;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Execution timed out after ${timeout}ms`));
      }, timeout);

      // Report progress
      this.config.onProgress?.(50, 'Executing...');

      definition
        .execute(context, inputs)
        .then((outputs) => {
          clearTimeout(timeoutId);
          resolve(outputs);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Create execution context
   */
  private createContext(
    properties: Record<string, any>,
    logger: Logger,
    executionInfo: Partial<ExecutionInfo>
  ): NodeContext {
    const variables = new Map<string, any>();

    return {
      properties,
      variables: {},
      setVariable: (key: string, value: any) => {
        variables.set(key, value);
      },
      getVariable: (key: string) => {
        return variables.get(key);
      },
      logger,
      http: new SimpleHttpClient(),
      secrets: new SimpleSecretsManager(),
      execution: {
        id: executionInfo.id || `exec-${Date.now()}`,
        flowId: executionInfo.flowId || '',
        projectId: executionInfo.projectId || '',
        nodeId: executionInfo.nodeId || '',
        startedAt: executionInfo.startedAt || new Date(),
        parentExecutionId: executionInfo.parentExecutionId,
      },
      isCancelled: () => this.cancelled,
      onCancel: (callback: () => void) => {
        this.cancelCallbacks.push(callback);
      },
      temp: new Map(),
    };
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a test context for unit testing nodes
 */
export function createTestContext(
  overrides: Partial<NodeContext> = {}
): NodeContext {
  const logger = new DefaultLogger();

  return {
    properties: {},
    variables: {},
    setVariable: () => {},
    getVariable: () => undefined,
    logger,
    http: new SimpleHttpClient(),
    secrets: new SimpleSecretsManager(),
    execution: {
      id: `test-${Date.now()}`,
      flowId: 'test-flow',
      projectId: 'test-project',
      nodeId: 'test-node',
      startedAt: new Date(),
    },
    isCancelled: () => false,
    onCancel: () => {},
    temp: new Map(),
    ...overrides,
  };
}

/**
 * Test helper for executing nodes in unit tests
 */
export async function testNode(
  definition: NodeDefinition | NodeConfig,
  properties: Record<string, any> = {},
  inputs: NodeInputs = {}
): Promise<ExecutionResult> {
  const executor = new NodeExecutor({
    timeout: 5000,
    enableLogging: true,
  });

  return executor.execute(definition, properties, inputs);
}

export default NodeExecutor;
