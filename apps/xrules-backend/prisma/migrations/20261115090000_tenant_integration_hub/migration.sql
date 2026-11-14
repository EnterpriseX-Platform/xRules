-- Integration moves up to the tenant: one hidden INTEGRATION project per tenant holds connections,
-- data sets, file templates, REST APIs and integration/trigger/data/API flows. Projects keep decisions.
ALTER TABLE "projects" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'DECISION';

INSERT INTO "projects" ("id", "name", "slug", "description", "workspaceId", "kind", "visibility", "createdAt", "updatedAt")
SELECT 'int_' || substr(md5(w.id), 1, 21), 'Integration', '_integration', 'Shared connections, data sets, REST APIs and triggers for this tenant',
       w.id, 'INTEGRATION', 'WORKSPACE', now(), now()
FROM "workspaces" w
WHERE NOT EXISTS (SELECT 1 FROM "projects" p WHERE p."workspaceId" = w.id AND p.kind = 'INTEGRATION');

CREATE TEMP TABLE hub AS SELECT p.id AS hub_id, p."workspaceId" FROM "projects" p WHERE p.kind = 'INTEGRATION';
CREATE TEMP TABLE proj_hub AS SELECT d.id AS project_id, h.hub_id FROM "projects" d JOIN hub h ON h."workspaceId" = d."workspaceId" WHERE d.kind = 'DECISION';

-- slugs must stay unique inside the hub: suffix any clash with the source project's slug
UPDATE "connections" c SET slug = c.slug || '-' || pr.slug FROM proj_hub ph JOIN "projects" pr ON pr.id = ph.project_id
 WHERE c."projectId" = ph.project_id AND EXISTS (SELECT 1 FROM "connections" c2 JOIN proj_hub ph2 ON ph2.project_id = c2."projectId" WHERE ph2.hub_id = ph.hub_id AND c2.slug = c.slug AND c2.id < c.id);
UPDATE "connections" c SET "projectId" = ph.hub_id FROM proj_hub ph WHERE c."projectId" = ph.project_id;

UPDATE "datasets" d SET slug = d.slug || '-' || pr.slug FROM proj_hub ph JOIN "projects" pr ON pr.id = ph.project_id
 WHERE d."projectId" = ph.project_id AND EXISTS (SELECT 1 FROM "datasets" d2 JOIN proj_hub ph2 ON ph2.project_id = d2."projectId" WHERE ph2.hub_id = ph.hub_id AND d2.slug = d.slug AND d2.id < d.id);
UPDATE "datasets" d SET "projectId" = ph.hub_id FROM proj_hub ph WHERE d."projectId" = ph.project_id;

UPDATE "file_templates" f SET "projectId" = ph.hub_id FROM proj_hub ph WHERE f."projectId" = ph.project_id;

UPDATE "api_specs" s SET slug = s.slug || '-' || pr.slug FROM proj_hub ph JOIN "projects" pr ON pr.id = ph.project_id
 WHERE s."projectId" = ph.project_id AND EXISTS (SELECT 1 FROM "api_specs" s2 JOIN proj_hub ph2 ON ph2.project_id = s2."projectId" WHERE ph2.hub_id = ph.hub_id AND s2.slug = s.slug AND s2.id < s.id);
UPDATE "api_specs" s SET "projectId" = ph.hub_id FROM proj_hub ph WHERE s."projectId" = ph.project_id;

UPDATE "flows" f SET slug = f.slug || '-' || pr.slug, alias = CASE WHEN f.alias IS NULL THEN NULL ELSE f.alias || '-' || pr.slug END
  FROM proj_hub ph JOIN "projects" pr ON pr.id = ph.project_id
 WHERE f."projectId" = ph.project_id AND f.kind IN ('API', 'TRIGGER', 'DATA', 'INTEGRATION')
   AND EXISTS (SELECT 1 FROM "flows" f2 JOIN proj_hub ph2 ON ph2.project_id = f2."projectId" WHERE ph2.hub_id = ph.hub_id AND f2.kind IN ('API', 'TRIGGER', 'DATA', 'INTEGRATION') AND f2.slug = f.slug AND f2.id < f.id);
UPDATE "flows" f SET "projectId" = ph.hub_id FROM proj_hub ph WHERE f."projectId" = ph.project_id AND f.kind IN ('API', 'TRIGGER', 'DATA', 'INTEGRATION');

CREATE UNIQUE INDEX "projects_one_integration_per_tenant" ON "projects" ("workspaceId") WHERE kind = 'INTEGRATION';
