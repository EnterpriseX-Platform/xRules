CREATE TABLE "member_removals" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "role" TEXT NOT NULL,
  "canApprove" BOOLEAN NOT NULL DEFAULT false,
  "projectAccess" JSONB NOT NULL DEFAULT '[]',
  "removedBy" TEXT NOT NULL,
  "removedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "restoredAt" TIMESTAMP(3),
  CONSTRAINT "member_removals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "member_removals_workspaceId_removedAt_idx" ON "member_removals"("workspaceId", "removedAt");
