CREATE TABLE IF NOT EXISTS "topics" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT, "goal" TEXT,
  "createdById" TEXT, "deletedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "topics_pkey" PRIMARY KEY ("id"));
CREATE INDEX IF NOT EXISTS "topics_projectId_idx" ON "topics"("projectId");
ALTER TABLE "rules" ADD COLUMN IF NOT EXISTS "topicId" TEXT;
ALTER TABLE "flows" ADD COLUMN IF NOT EXISTS "topicId" TEXT;
