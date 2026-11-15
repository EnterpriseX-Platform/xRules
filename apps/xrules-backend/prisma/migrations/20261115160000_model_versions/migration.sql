-- Trained model versions (ML Studio inside Models, TOR 4.13.1)
CREATE TABLE "model_versions" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TRAINING',
    "config" JSONB NOT NULL,
    "report" JSONB,
    "artifact" BYTEA,
    "error" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trainedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    CONSTRAINT "model_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "model_versions_modelId_version_key" ON "model_versions"("modelId", "version");
ALTER TABLE "model_versions" ADD CONSTRAINT "model_versions_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "models"("id") ON DELETE CASCADE ON UPDATE CASCADE;
