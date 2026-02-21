import { Integration, WebhookConfig, WebhookEvent } from '@xrules/core';

export interface WebhookPayload {
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
  signature?: string;
}

export interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  responseBody?: string;
  error?: string;
  latency: number;
  retryCount: number;
}

export interface ConnectionTestResult {
  success: boolean;
  latency: number;
  error?: string;
  details?: Record<string, unknown>;
}

export interface ConnectorMetadata {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category: 'webhook' | 'database' | 'api' | 'queue' | 'file';
  supportedOperations: string[];
  configSchema: Record<string, unknown>;
}

export interface WebhookSubscription {
  id: string;
  events: string[];
  url: string;
  active: boolean;
  createdAt: Date;
}

export { Integration, WebhookConfig, WebhookEvent };
