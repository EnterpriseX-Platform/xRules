/**
 * Integration & Webhook Types
 */

export interface Integration {
  id: string;
  projectId: string;
  name: string;
  type: IntegrationType;
  status: 'active' | 'inactive' | 'error';
  config: IntegrationConfig;
  credentials?: Record<string, string>;
  lastSyncAt?: Date;
  errorCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type IntegrationType = 
  | 'webhook' 
  | 'rest-api' 
  | 'graphql' 
  | 'database' 
  | 'message-queue'
  | 'file-storage'
  | 'email'
  | 'slack'
  | 'teams'
  | 'custom';

export type IntegrationConfig = 
  | WebhookConfig 
  | RestApiConfig 
  | DatabaseConfig 
  | MessageQueueConfig;

export interface WebhookConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  secret?: string; // For HMAC signature
  retryPolicy?: RetryPolicy;
  timeout?: number;
}

export interface RestApiConfig {
  baseUrl: string;
  authType: 'none' | 'basic' | 'bearer' | 'api-key' | 'oauth2';
  authConfig?: Record<string, string>;
  headers?: Record<string, string>;
  timeout?: number;
}

export interface DatabaseConfig {
  type: 'postgresql' | 'mysql' | 'mongodb' | 'redis' | 'mssql';
  host: string;
  port: number;
  database: string;
  username: string;
  ssl?: boolean;
  connectionString?: string;
}

export interface MessageQueueConfig {
  type: 'kafka' | 'rabbitmq' | 'sqs' | 'azure-service-bus';
  connectionString: string;
  topic?: string;
  queue?: string;
}

export interface RetryPolicy {
  maxRetries: number;
  retryInterval: number;
  backoffMultiplier: number;
  maxInterval: number;
}

export interface WebhookEvent {
  id: string;
  integrationId: string;
  eventType: string;
  payload: Record<string, unknown>;
  timestamp: Date;
  signature?: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventId: string;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  responseStatus?: number;
  responseBody?: string;
  errorMessage?: string;
  sentAt?: Date;
  deliveredAt?: Date;
}

export interface Connector {
  id: string;
  name: string;
  type: IntegrationType;
  icon?: string;
  description?: string;
  schema: ConnectorSchema;
}

export interface ConnectorSchema {
  inputs: ConnectorField[];
  outputs: ConnectorField[];
  config: ConnectorField[];
}

export interface ConnectorField {
  name: string;
  type: string;
  label: string;
  required?: boolean;
  description?: string;
  defaultValue?: unknown;
  options?: Array<{ label: string; value: unknown }>;
}
