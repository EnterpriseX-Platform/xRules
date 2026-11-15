-- Integrator role (may change the tenant's Integration hub) and a per-member "can approve" flag.
ALTER TYPE "WorkspaceRole" ADD VALUE IF NOT EXISTS 'INTEGRATOR' BEFORE 'MEMBER';
ALTER TABLE "workspace_members" ADD COLUMN IF NOT EXISTS "canApprove" BOOLEAN NOT NULL DEFAULT false;
