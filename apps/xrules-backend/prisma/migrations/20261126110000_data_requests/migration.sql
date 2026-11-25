CREATE TABLE IF NOT EXISTS "data_requests" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "term" TEXT NOT NULL,
  "path" TEXT,
  "note" TEXT,
  "sampleValue" TEXT,
  "ruleId" TEXT,
  "topicId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "requestedBy" TEXT NOT NULL,
  "answer" TEXT,
  "doneBy" TEXT,
  "doneAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "data_requests_projectId_status_idx" ON "data_requests"("projectId", "status");
