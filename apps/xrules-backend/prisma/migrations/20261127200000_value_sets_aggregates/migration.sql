ALTER TABLE "vocabulary_terms" ADD COLUMN IF NOT EXISTS "valueSetId" TEXT;
ALTER TABLE "vocabulary_terms" ADD COLUMN IF NOT EXISTS "aggregate" JSONB;
CREATE TABLE IF NOT EXISTS "value_sets" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "columns" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "rows" JSONB NOT NULL DEFAULT '[]',
  "groups" JSONB NOT NULL DEFAULT '{}',
  "version" INTEGER NOT NULL DEFAULT 1,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "value_sets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "value_sets_projectId_idx" ON "value_sets"("projectId");
