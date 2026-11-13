-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FlowKind" ADD VALUE 'API';
ALTER TYPE "FlowKind" ADD VALUE 'TRIGGER';

-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "rateLimitPerMin" INTEGER NOT NULL DEFAULT 600,
ADD COLUMN     "specIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "systemName" TEXT;
