-- AlterTable
ALTER TABLE "module_routes" ADD COLUMN IF NOT EXISTS "auth_mode" TEXT NOT NULL DEFAULT 'actor';
ALTER TABLE "module_routes" ADD COLUMN IF NOT EXISTS "webhook_secret_name" TEXT;
