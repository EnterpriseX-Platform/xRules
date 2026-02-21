// User Types
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: 'admin' | 'user' | 'viewer';
  createdAt: string;
  updatedAt: string;
}

// Workspace Types
export interface Workspace {
  id: string;
  name: string;
  description?: string;
  slug: string;
  ownerId: string;
  members: WorkspaceMember[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  id: string;
  userId: string;
  workspaceId: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  user: User;
}

// Project Types
export interface Project {
  id: string;
  name: string;
  description?: string;
  workspaceId: string;
  code: string;
  group?: string;
  agency?: string;
  level?: string;
  status: 'active' | 'inactive' | 'archived';
  stats: ProjectStats;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectStats {
  totalRules: number;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
}

// Rule/Flow Types
export interface Rule {
  id: string;
  name: string;
  description?: string;
  projectId: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  status: 'draft' | 'active' | 'archived';
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface FlowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: NodeData;
}

export type NodeType =
  | 'api-input'
  | 'api-output'
  | 'database'
  | 'http'
  | 'condition'
  | 'transform'
  | 'sftp'
  | 'schedule-trigger'
  | 'basket-trigger'
  | 'delay'
  | 'aggregate-split'
  | 'aggregate-join'
  | 'file-read'
  | 'file-write';

export interface NodeData {
  label: string;
  description?: string;
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  type?: 'default' | 'smoothstep' | 'straight';
}

// Connection Types
export interface Connection {
  id: string;
  name: string;
  type: ConnectionType;
  projectId: string;
  config: ConnectionConfig;
  status: 'active' | 'inactive' | 'error';
  lastTestedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type ConnectionType = 'postgresql' | 'mysql' | 'sqlite' | 'oracle' | 'mssql' | 'http' | 'sftp';

export interface ConnectionConfig {
  // Database
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  sslMode?: 'disable' | 'allow' | 'prefer' | 'require' | 'verify-ca' | 'verify-full';
  
  // HTTP
  baseUrl?: string;
  authType?: 'none' | 'basic' | 'bearer' | 'oauth2' | 'api-key';
  authConfig?: Record<string, string>;
  headers?: Record<string, string>;
  
  // SFTP
  hostKey?: string;
  privateKey?: string;
  
  // Common
  timeout?: number;
  retries?: number;
}

// Execution Types
export interface Execution {
  id: string;
  ruleId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  logs: ExecutionLog[];
  metrics: ExecutionMetrics;
  startedAt: string;
  completedAt?: string;
  createdAt: string;
}

export interface ExecutionLog {
  id: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  nodeId?: string;
  nodeType?: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ExecutionMetrics {
  durationMs: number;
  nodeCount: number;
  nodesExecuted: number;
  dataProcessed?: number;
}

// Scheduler Types
export interface Scheduler {
  id: string;
  ruleId: string;
  name: string;
  cronExpression: string;
  timezone: string;
  isActive: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

// API Key Types
export interface ApiKey {
  id: string;
  name: string;
  key: string;
  type: 'client' | 'server' | 'webhook' | 'service';
  projectId: string;
  permissions: string[];
  ipRestrictions?: string[];
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
}

// Basket Types
export interface Basket {
  id: string;
  name: string;
  type: 'batch' | 'shares';
  projectId: string;
  config: BasketConfig;
  createdAt: string;
  updatedAt: string;
}

export interface BasketConfig {
  maxFileSize?: number;
  allowedExtensions?: string[];
  autoProcess?: boolean;
  retentionDays?: number;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Auth Types
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// OAuth Types
export type OAuthProvider = 'google' | 'github' | 'microsoft' | 'oidc';

export interface OAuthProviderConfig {
  id: string;
  name: string;
  displayName: string;
}

export interface OAuthAccount {
  id: string;
  provider: OAuthProvider;
  email: string;
  name: string;
  createdAt: string;
}

export interface OAuthCallbackData {
  provider: OAuthProvider;
  code: string;
  state: string;
}
