/**
 * Deployment Management Types
 */

export interface Deployment {
  id: string;
  ruleId: string;
  projectId: string;
  environmentId: string;
  version: number;
  status: DeploymentStatus;
  config: DeploymentConfig;
  deployedAt?: Date;
  deployedBy?: string;
  approvedBy?: string;
  approvedAt?: Date;
  rollbackDeploymentId?: string;
  metrics?: DeploymentMetrics;
}

export type DeploymentStatus = 
  | 'pending' 
  | 'approved' 
  | 'rejected' 
  | 'deploying' 
  | 'deployed' 
  | 'failed' 
  | 'rollback';

export interface DeploymentConfig {
  autoRollback: boolean;
  canaryPercentage?: number;
  trafficSplit?: TrafficSplit[];
  healthCheck?: HealthCheckConfig;
  notifications?: NotificationConfig[];
}

export interface TrafficSplit {
  version: number;
  percentage: number;
}

export interface HealthCheckConfig {
  endpoint: string;
  interval: number;
  timeout: number;
  healthyThreshold: number;
  unhealthyThreshold: number;
}

export interface NotificationConfig {
  type: 'email' | 'slack' | 'webhook';
  target: string;
  events: string[];
}

export interface DeploymentMetrics {
  totalRequests: number;
  errorRate: number;
  avgLatency: number;
  p95Latency: number;
  uptime: number;
}

export interface DeploymentPipeline {
  id: string;
  name: string;
  projectId: string;
  stages: PipelineStage[];
  triggers: PipelineTrigger[];
}

export interface PipelineStage {
  id: string;
  name: string;
  type: 'build' | 'test' | 'approval' | 'deploy' | 'notify';
  environmentId?: string;
  config?: Record<string, unknown>;
  dependsOn?: string[];
}

export interface PipelineTrigger {
  type: 'manual' | 'schedule' | 'webhook' | 'git';
  config: Record<string, unknown>;
}

export interface Release {
  id: string;
  ruleId: string;
  version: number;
  name: string;
  description?: string;
  changes: ChangeLogEntry[];
  createdAt: Date;
  createdBy: string;
}

export interface ChangeLogEntry {
  type: 'added' | 'changed' | 'deprecated' | 'removed' | 'fixed' | 'security';
  description: string;
}
