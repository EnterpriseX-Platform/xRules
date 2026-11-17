-- Removes everything the browser E2E creates (names start with e2e / E2E) from tenant neb-budget-bureau,
-- plus throw-away accounts (*@example.test) and their own tenants. Run after a suite:
--   kubectl -n budget-bb exec -i deploy/xrules-postgres -- psql -U xrules -d xrulesdb -v ON_ERROR_STOP=1 < e2e/cleanup-uat.sql
BEGIN;
CREATE TEMP TABLE pr AS SELECT p.id FROM projects p JOIN workspaces w ON w.id = p."workspaceId" WHERE w.slug = 'neb-budget-bureau';
CREATE TEMP TABLE sp AS SELECT id FROM api_specs WHERE "projectId" IN (SELECT id FROM pr) AND "basePath" LIKE 'e2e-%';
DELETE FROM review_requests WHERE "targetId" IN (SELECT id FROM sp);
CREATE TEMP TABLE opf AS SELECT "flowId" AS id FROM api_operations WHERE "specId" IN (SELECT id FROM sp);
DELETE FROM api_specs WHERE id IN (SELECT id FROM sp);
DELETE FROM flows WHERE id IN (SELECT id FROM opf) OR ("projectId" IN (SELECT id FROM pr) AND slug LIKE 'e2e-%');
DELETE FROM rules WHERE "projectId" IN (SELECT id FROM pr) AND slug LIKE 'e2e-%';
DELETE FROM folders WHERE "projectId" IN (SELECT id FROM pr) AND name LIKE 'e2e %';
DELETE FROM models WHERE "projectId" IN (SELECT id FROM pr) AND (name LIKE 'e2e %' OR slug LIKE 'ml-smoke-%');
DELETE FROM rules WHERE "projectId" IN (SELECT id FROM pr) AND slug LIKE 'ml-smoke-%';
DELETE FROM datasets WHERE "projectId" IN (SELECT id FROM pr) AND (slug LIKE 'ml-requests-%' OR slug LIKE 'ml-smoke-%');
DELETE FROM test_cases WHERE "projectId" IN (SELECT id FROM pr) AND name LIKE 'e2e %';
DELETE FROM test_suites WHERE "projectId" IN (SELECT id FROM pr) AND name LIKE 'e2e suite%';
DELETE FROM bulk_runs WHERE "projectId" IN (SELECT id FROM pr) AND name LIKE 'e2e bulk%';
DELETE FROM vocabulary_terms WHERE "projectId" IN (SELECT id FROM pr) AND term LIKE 'requested amount %';
DELETE FROM projects WHERE id IN (SELECT id FROM pr) AND name LIKE 'E2E project%';
DELETE FROM api_keys WHERE "workspaceId" = (SELECT id FROM workspaces WHERE slug = 'neb-budget-bureau') AND name LIKE 'e2e-key-%';
DELETE FROM webhooks WHERE "workspaceId" = (SELECT id FROM workspaces WHERE slug = 'neb-budget-bureau') AND name LIKE 'e2e hook%';
CREATE TEMP TABLE u AS SELECT id FROM users WHERE email LIKE '%@example.test';
DELETE FROM workspaces w WHERE EXISTS (SELECT 1 FROM workspace_members m WHERE m."workspaceId" = w.id AND m."userId" IN (SELECT id FROM u))
  AND NOT EXISTS (SELECT 1 FROM workspace_members m WHERE m."workspaceId" = w.id AND m."userId" NOT IN (SELECT id FROM u));
DELETE FROM users WHERE id IN (SELECT id FROM u);
COMMIT;
-- keys the API smoke scripts create on every run (smoke, smoke-bulk, smoke-ch)
DELETE FROM api_keys WHERE name IN ('smoke', 'smoke-bulk', 'smoke-ch');
