-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('ADMIN', 'EDITOR', 'VIEWER');

-- DropIndex
DROP INDEX "api_specs_basePath_version_key";

-- AlterTable
ALTER TABLE "api_specs" ADD COLUMN "workspaceId" TEXT;
UPDATE "api_specs" s SET "workspaceId" = p."workspaceId" FROM "projects" p WHERE p.id = s."projectId";
ALTER TABLE "api_specs" ALTER COLUMN "workspaceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "visibility" TEXT NOT NULL DEFAULT 'WORKSPACE';

-- CreateTable
CREATE TABLE "project_members" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'EDITOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_members_userId_idx" ON "project_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_projectId_userId_key" ON "project_members"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "api_specs_workspaceId_basePath_version_key" ON "api_specs"("workspaceId", "basePath", "version");

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

