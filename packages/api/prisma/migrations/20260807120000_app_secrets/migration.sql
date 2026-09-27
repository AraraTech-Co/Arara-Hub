-- CreateTable
CREATE TABLE IF NOT EXISTS "app_secrets" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "auth_tag" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_secrets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "app_secrets_app_id_idx" ON "app_secrets"("app_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "app_secrets_app_id_name_key" ON "app_secrets"("app_id", "name");

-- AddForeignKey (guarded)
DO $$ BEGIN
  ALTER TABLE "app_secrets" ADD CONSTRAINT "app_secrets_app_id_fkey"
    FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
