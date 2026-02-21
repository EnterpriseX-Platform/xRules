import { Deployment, Release, PipelineStage } from '@xrules/core';

export interface DeployOptions {
  autoRollback: boolean;
  canaryPercentage?: number;
  requireApproval?: boolean;
  notifyChannels?: string[];
}

export interface RollbackOptions {
  toVersion?: number;
  reason?: string;
}

export interface DeploymentStatus {
  deploymentId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back';
  progress: number;
  currentStage?: string;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface VersionDiff {
  fromVersion: number;
  toVersion: number;
  changes: Array<{
    type: 'added' | 'modified' | 'removed';
    path: string;
    oldValue?: unknown;
    newValue?: unknown;
  }>;
}

export interface PipelineConfig {
  stages: PipelineStage[];
  autoPromote: boolean;
  approvalGates: string[];
}

export { Deployment, Release, PipelineStage };
