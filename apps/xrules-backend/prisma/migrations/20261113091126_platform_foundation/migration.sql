-- CreateEnum
CREATE TYPE "BulkStatus" AS ENUM ('QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "executions" ADD COLUMN     "bulkRunId" TEXT,
ADD COLUMN     "operationId" TEXT,
ADD COLUMN     "requestId" TEXT,
ADD COLUMN     "targetType" TEXT,
ADD COLUMN     "traceFull" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "flows" ADD COLUMN     "challenger" JSONB,
ADD COLUMN     "reviewState" TEXT NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "rules" ADD COLUMN     "reviewState" TEXT NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "test_cases" ADD COLUMN     "expectations" JSONB,
ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "suiteIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "targetId" TEXT,
ADD COLUMN     "targetType" TEXT NOT NULL DEFAULT 'rule',
ALTER COLUMN "ruleId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "api_specs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "basePath" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "status" "RuleStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "reviewState" TEXT NOT NULL DEFAULT 'NONE',
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_operations" (
    "id" TEXT NOT NULL,
    "specId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "summary" TEXT,
    "requestSchema" JSONB,
    "responseSchema" JSONB,
    "flowId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulk_runs" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetVersion" INTEGER,
    "source" JSONB NOT NULL,
    "mapping" JSONB,
    "status" "BulkStatus" NOT NULL DEFAULT 'QUEUED',
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "passed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "errored" INTEGER NOT NULL DEFAULT 0,
    "concurrency" INTEGER NOT NULL DEFAULT 8,
    "summary" JSONB,
    "lineage" JSONB,
    "compareToId" TEXT,
    "projectId" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "bulk_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulk_run_rows" (
    "id" BIGSERIAL NOT NULL,
    "runId" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "ms" INTEGER,

    CONSTRAINT "bulk_run_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_requests" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "submittedBy" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "note" TEXT,
    "decisionNote" TEXT,
    "evidence" JSONB,
    "snapshot" JSONB,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "review_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocabulary_terms" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "values" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vocabulary_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "windowMin" INTEGER NOT NULL DEFAULT 5,
    "target" TEXT,
    "channels" JSONB NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_events" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'FIRING',
    "value" DOUBLE PRECISION NOT NULL,
    "message" TEXT NOT NULL,
    "ackBy" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_jobs" (
    "id" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupeKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "queue_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_specs_projectId_slug_key" ON "api_specs"("projectId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "api_specs_basePath_version_key" ON "api_specs"("basePath", "version");

-- CreateIndex
CREATE UNIQUE INDEX "api_operations_flowId_key" ON "api_operations"("flowId");

-- CreateIndex
CREATE UNIQUE INDEX "api_operations_specId_method_path_key" ON "api_operations"("specId", "method", "path");

-- CreateIndex
CREATE INDEX "bulk_runs_projectId_createdAt_idx" ON "bulk_runs"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "bulk_run_rows_runId_status_idx" ON "bulk_run_rows"("runId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bulk_run_rows_runId_idx_key" ON "bulk_run_rows"("runId", "idx");

-- CreateIndex
CREATE INDEX "review_requests_projectId_status_idx" ON "review_requests"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "vocabulary_terms_projectId_term_key" ON "vocabulary_terms"("projectId", "term");

-- CreateIndex
CREATE INDEX "alert_events_ruleId_startedAt_idx" ON "alert_events"("ruleId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "queue_jobs_dedupeKey_key" ON "queue_jobs"("dedupeKey");

-- CreateIndex
CREATE INDEX "queue_jobs_queue_status_runAt_idx" ON "queue_jobs"("queue", "status", "runAt");

-- CreateIndex
CREATE INDEX "outbox_sentAt_nextAt_idx" ON "outbox"("sentAt", "nextAt");

-- CreateIndex
CREATE INDEX "executions_operationId_createdAt_idx" ON "executions"("operationId", "createdAt");

-- CreateIndex
CREATE INDEX "executions_targetType_createdAt_idx" ON "executions"("targetType", "createdAt");

-- AddForeignKey
ALTER TABLE "api_specs" ADD CONSTRAINT "api_specs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_operations" ADD CONSTRAINT "api_operations_specId_fkey" FOREIGN KEY ("specId") REFERENCES "api_specs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_operations" ADD CONSTRAINT "api_operations_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_runs" ADD CONSTRAINT "bulk_runs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_run_rows" ADD CONSTRAINT "bulk_run_rows_runId_fkey" FOREIGN KEY ("runId") REFERENCES "bulk_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_terms" ADD CONSTRAINT "vocabulary_terms_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "alert_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
