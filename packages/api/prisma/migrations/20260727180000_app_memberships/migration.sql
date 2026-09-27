-- CreateTable
CREATE TABLE IF NOT EXISTS "app_memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "app_memberships_app_id_idx" ON "app_memberships"("app_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "app_memberships_user_id_app_id_key" ON "app_memberships"("user_id", "app_id");

-- AddForeignKey (guarded)
DO $$ BEGIN
  ALTER TABLE "app_memberships" ADD CONSTRAINT "app_memberships_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "app_memberships" ADD CONSTRAINT "app_memberships_app_id_fkey"
    FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
