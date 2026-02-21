/**
 * Workspace & Project Types (Multi-tenancy)
 */

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description?: string;
  status: 'active' | 'suspended' | 'deleted';
  plan: WorkspacePlan;
  ownerId: string;
  settings: WorkspaceSettings;
  limits: WorkspaceLimits;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspacePlan {
  type: 'free' | 'starter' | 'professional' | 'enterprise';
  name: string;
  expiresAt?: Date;
}

export interface WorkspaceSettings {
  timezone: string;
  locale: string;
  currency: string;
  features: Record<string, boolean>;
}

export interface WorkspaceLimits {
  maxProjects: number;
  maxRules: number;
  maxExecutionsPerMonth: number;
  maxStorageMB: number;
  maxTeamMembers: number;
}

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
}

export interface Environment {
  id: string;
  name: string;
  type: 'development' | 'staging' | 'production';
  url?: string;
  config?: Record<string, string>;
}

export interface TeamMember {
  id: string;
  workspaceId: string;
  userId: string;
  email: string;
  name: string;
  role: TeamRole;
  permissions: Permission[];
  joinedAt: Date;
}

export type TeamRole = 'owner' | 'admin' | 'editor' | 'viewer';

export type Permission = 
  | 'workspace:read' | 'workspace:write' | 'workspace:delete'
  | 'project:read' | 'project:write' | 'project:delete'
  | 'rule:read' | 'rule:write' | 'rule:delete' | 'rule:deploy'
  | 'test:read' | 'test:write' | 'test:execute'
  | 'integration:read' | 'integration:write' | 'integration:delete'
  | 'audit:read' | 'settings:read' | 'settings:write';
