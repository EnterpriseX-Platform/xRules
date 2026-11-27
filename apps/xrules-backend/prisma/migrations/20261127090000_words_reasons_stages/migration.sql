ALTER TABLE "vocabulary_terms" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "shape" TEXT NOT NULL DEFAULT 'questions';
ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "stages" JSONB;
CREATE TABLE IF NOT EXISTS "reason_codes" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "outcome" TEXT NOT NULL DEFAULT 'Decline',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reason_codes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "reason_codes_projectId_idx" ON "reason_codes"("projectId");
