-- AlterTable
ALTER TABLE "app_secrets" ADD COLUMN IF NOT EXISTS "server_only" BOOLEAN NOT NULL DEFAULT true;
