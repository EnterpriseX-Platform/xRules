/**
 * Project Types
 */

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  status: 'active' | 'archived' | 'deleted';
  settings: ProjectSettings;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface ProjectSettings {
  defaultEnvironment: string;
  environments: Environment[];
  autoDeploy?: boolean;
  requireApproval?: boolean;
  notifications?: NotificationSettings;
}

export interface Environment {
  id: string;
  name: string;
  type: 'development' | 'staging' | 'production';
  url?: string;
  config?: Record<string, string>;
  isDefault?: boolean;
}

export interface NotificationSettings {
  onDeploymentSuccess?: boolean;
  onDeploymentFailure?: boolean;
  onTestFailure?: boolean;
  channels?: NotificationChannel[];
}

export interface NotificationChannel {
  type: 'email' | 'slack' | 'webhook';
  target: string;
}

export interface ProjectMetrics {
  projectId: string;
  totalRules: number;
  activeRules: number;
  totalExecutions: number;
  avgExecutionTime: number;
  successRate: number;
  lastDeployedAt?: Date;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  email: string;
  name: string;
  role: ProjectRole;
  joinedAt: Date;
}

export type ProjectRole = 'owner' | 'maintainer' | 'developer' | 'reporter';
