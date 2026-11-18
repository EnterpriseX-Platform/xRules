-- Every id is a CUID: data set rows and bulk run rows move off auto-increment numbers.
-- Row order is kept in "idx" (data set rows get it from their current order).
ALTER TABLE "dataset_rows" ADD COLUMN "idx" INTEGER;
UPDATE "dataset_rows" d SET "idx" = r.n
  FROM (SELECT "id", (row_number() OVER (PARTITION BY "snapshotId" ORDER BY "id") - 1)::int AS n FROM "dataset_rows") r
  WHERE d."id" = r."id";
ALTER TABLE "dataset_rows" ALTER COLUMN "idx" SET NOT NULL;
ALTER TABLE "dataset_rows" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "dataset_rows" ALTER COLUMN "id" TYPE TEXT USING ('c' || substr(md5("id"::text || clock_timestamp()::text || random()::text), 1, 24));
DROP SEQUENCE IF EXISTS "dataset_rows_id_seq";
CREATE INDEX "dataset_rows_snapshotId_idx_idx" ON "dataset_rows"("snapshotId", "idx");

ALTER TABLE "bulk_run_rows" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "bulk_run_rows" ALTER COLUMN "id" TYPE TEXT USING ('c' || substr(md5("id"::text || clock_timestamp()::text || random()::text), 1, 24));
DROP SEQUENCE IF EXISTS "bulk_run_rows_id_seq";
