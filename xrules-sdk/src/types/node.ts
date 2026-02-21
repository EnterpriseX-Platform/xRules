/**
 * Node Type Definitions
 * Core type system for the XRULES SDK
 */

import { z } from 'zod';

// ============================================================================
// Property Types
// ============================================================================

export type PropertyType = 
  | 'string' 
  | 'number' 
  | 'boolean' 
  | 'select' 
  | 'multiselect'
  | 'json' 
  | 'code'
  | 'connection'
  | 'date'
  | 'datetime'
  | 'file'
  | 'secret';

export interface PropertyOption {
  label: string;
  value: string | number | boolean;
}

export interface BasePropertyConfig {
  name: string;
  type: PropertyType;
  label: string;
  description?: string;
  required?: boolean;
  default?: any;
  placeholder?: string;
  hidden?: boolean | ((context: { properties: Record<string, any> }) => boolean);
  disabled?: boolean | ((context: { properties: Record<string, any> }) => boolean);
}

export interface StringPropertyConfig extends BasePropertyConfig {
  type: 'string';
  multiline?: boolean;
  secret?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface NumberPropertyConfig extends BasePropertyConfig {
  type: 'number';
  min?: number;
  max?: number;
  step?: number;
}

export interface BooleanPropertyConfig extends BasePropertyConfig {
  type: 'boolean';
}

export interface SelectPropertyConfig extends BasePropertyConfig {
  type: 'select';
  options: PropertyOption[] | string[] | (() => Promise<PropertyOption[]>);
  allowCustom?: boolean;
}

export interface MultiSelectPropertyConfig extends BasePropertyConfig {
  type: 'multiselect';
  options: PropertyOption[] | string[];
}

export interface JsonPropertyConfig extends BasePropertyConfig {
  type: 'json';
  schema?: z.ZodType<any> | object;
}

export interface CodePropertyConfig extends BasePropertyConfig {
  type: 'code';
  language: 'javascript' | 'typescript' | 'python' | 'sql' | 'json' | 'yaml' | 'html' | 'css';
  theme?: string;
}

export interface ConnectionPropertyConfig extends BasePropertyConfig {
  type: 'connection';
  connectionType: string;
}

export interface DatePropertyConfig extends BasePropertyConfig {
  type: 'date' | 'datetime';
  min?: Date;
  max?: Date;
}

export interface FilePropertyConfig extends BasePropertyConfig {
  type: 'file';
  accept?: string;
  multiple?: boolean;
  maxSize?: number;
}

export interface SecretPropertyConfig extends BasePropertyConfig {
  type: 'secret';
}

export type PropertyConfig =
  | StringPropertyConfig
  | NumberPropertyConfig
  | BooleanPropertyConfig
  | SelectPropertyConfig
  | MultiSelectPropertyConfig
  | JsonPropertyConfig
  | CodePropertyConfig
  | ConnectionPropertyConfig
  | DatePropertyConfig
  | FilePropertyConfig
  | SecretPropertyConfig;

// ============================================================================
// Port Types
// ============================================================================

export interface PortConfig {
  name: string;
  label?: string;
  type?: string;
  description?: string;
  required?: boolean;
  multiple?: boolean;
  schema?: z.ZodType<any>;
}

// ============================================================================
// Node Configuration
// ============================================================================

export interface NodeCategory {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  color?: string;
}

export interface NodeBadge {
  text: string;
  color?: string;
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
}

export interface NodeConfig {
  id: string;
  name: string;
  category: string;
  icon?: string;
  description?: string;
  version?: string;
  author?: string;
  tags?: string[];
  badge?: NodeBadge;
  
  // Ports
  inputs: (string | PortConfig)[];
  outputs: (string | PortConfig)[];
  
  // Configuration
  properties: PropertyConfig[];
  
  // Validation
  validate?: (config: Record<string, any>) => void | Promise<void>;
  validationSchema?: z.ZodType<any>;
  
  // Dynamic behavior
  getDynamicInputs?: (config: Record<string, any>) => (string | PortConfig)[];
  getDynamicOutputs?: (config: Record<string, any>) => (string | PortConfig)[];
  getDynamicProperties?: (config: Record<string, any>) => PropertyConfig[];
  
  // Execution
  execute: ExecuteFunction;
  
  // Lifecycle hooks
  onInit?: (context: NodeContext) => Promise<void>;
  onDestroy?: (context: NodeContext) => Promise<void>;
  
  // UI customization
  renderNode?: (props: NodeRenderProps) => React.ReactNode;
  renderPropertyPanel?: (props: PropertyPanelProps) => React.ReactNode;
  
  // Documentation
  documentation?: {
    summary?: string;
    description?: string;
    inputs?: Record<string, string>;
    outputs?: Record<string, string>;
    examples?: Array<{
      title: string;
      description?: string;
      config: Record<string, any>;
      input?: any;
      output?: any;
    }>;
  };
}

// ============================================================================
// Execution Context
// ============================================================================

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface Logger {
  debug: (message: string, metadata?: Record<string, any>) => void;
  info: (message: string, metadata?: Record<string, any>) => void;
  warn: (message: string, metadata?: Record<string, any>) => void;
  error: (message: string, metadata?: Record<string, any>) => void;
}

export interface SecretsManager {
  get: (key: string) => Promise<string | undefined>;
  set: (key: string, value: string) => Promise<void>;
  delete: (key: string) => Promise<void>;
  list: () => Promise<string[]>;
}

export interface HttpClient {
  get: <T = any>(url: string, config?: any) => Promise<T>;
  post: <T = any>(url: string, data?: any, config?: any) => Promise<T>;
  put: <T = any>(url: string, data?: any, config?: any) => Promise<T>;
  patch: <T = any>(url: string, data?: any, config?: any) => Promise<T>;
  delete: <T = any>(url: string, config?: any) => Promise<T>;
  request: <T = any>(config: any) => Promise<T>;
}

export interface ExecutionInfo {
  id: string;
  flowId: string;
  projectId: string;
  nodeId: string;
  startedAt: Date;
  parentExecutionId?: string;
}

export interface NodeContext {
  // Node configuration
  properties: Record<string, any>;
  
  // Flow state
  variables: Record<string, any>;
  setVariable: (key: string, value: any) => void;
  getVariable: (key: string) => any;
  
  // Utilities
  logger: Logger;
  http: HttpClient;
  secrets: SecretsManager;
  
  // Execution info
  execution: ExecutionInfo;
  
  // Cancellation
  isCancelled: () => boolean;
  onCancel: (callback: () => void) => void;
  
  // Temporary storage (per execution)
  temp: Map<string, any>;
}

export interface NodeInputs {
  [key: string]: any;
}

export interface NodeOutputs {
  [key: string]: any;
}

export type ExecuteFunction = (
  context: NodeContext,
  inputs: NodeInputs
) => Promise<NodeOutputs> | NodeOutputs;

// ============================================================================
// UI Types
// ============================================================================

export interface NodeRenderProps {
  node: {
    id: string;
    type: string;
    config: Record<string, any>;
    position: { x: number; y: number };
  };
  isSelected: boolean;
  isExecuting: boolean;
  hasError: boolean;
  errorMessage?: string;
}

export interface PropertyPanelProps {
  properties: Record<string, any>;
  onChange: (name: string, value: any) => void;
  errors?: Record<string, string>;
  isReadOnly?: boolean;
}

// ============================================================================
// Registry Types
// ============================================================================

export interface RegisteredNode {
  definition: NodeConfig;
  metadata: {
    registeredAt: Date;
    packageName?: string;
    packageVersion?: string;
    source?: string;
  };
}

export interface NodeRegistryConfig {
  allowOverrides?: boolean;
  validateOnRegister?: boolean;
  onRegister?: (node: NodeConfig) => void;
  onUnregister?: (nodeId: string) => void;
}

// ============================================================================
// Package Types
// ============================================================================

export interface NodePackageConfig {
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  keywords?: string[];
  nodes: NodeConfig[];
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export interface PublishConfig {
  registry: string;
  token?: string;
  tag?: string;
  access?: 'public' | 'restricted';
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  path: string;
  message: string;
  code: string;
}

// ============================================================================
// Zod Schemas for Runtime Validation
// ============================================================================

export const PortConfigSchema = z.object({
  name: z.string(),
  label: z.string().optional(),
  type: z.string().optional(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  multiple: z.boolean().optional(),
});

export const BasePropertySchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'select', 'multiselect', 'json', 'code', 'connection', 'date', 'datetime', 'file', 'secret']),
  label: z.string(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  default: z.any().optional(),
  placeholder: z.string().optional(),
  hidden: z.union([z.boolean(), z.function()]).optional(),
  disabled: z.union([z.boolean(), z.function()]).optional(),
});

export const NodeConfigSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  category: z.string(),
  icon: z.string().optional(),
  description: z.string().optional(),
  version: z.string().optional(),
  author: z.string().optional(),
  tags: z.array(z.string()).optional(),
  
  inputs: z.array(z.union([z.string(), PortConfigSchema])),
  outputs: z.array(z.union([z.string(), PortConfigSchema])),
  properties: z.array(BasePropertySchema),
  
  execute: z.function(),
  validate: z.function().optional(),
  
  onInit: z.function().optional(),
  onDestroy: z.function().optional(),
});
