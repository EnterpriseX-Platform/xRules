ALTER TABLE "rules" ADD COLUMN IF NOT EXISTS "library" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "rules" ADD COLUMN IF NOT EXISTS "libraryRef" JSONB;
CREATE TABLE IF NOT EXISTS "product_settings" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "values" JSONB NOT NULL DEFAULT '{}',
  "position" INTEGER NOT NULL DEFAULT 0,
  "deletedAt" TIMESTAMP(3),
  "deletedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_settings_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "product_settings_projectId_idx" ON "product_settings"("projectId");
