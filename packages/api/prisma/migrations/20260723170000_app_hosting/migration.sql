-- CreateEnum
CREATE TYPE "HostingStatus" AS ENUM ('stopped', 'starting', 'running', 'error');

-- CreateTable
CREATE TABLE "app_hostings" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "artifact_path" TEXT NOT NULL,
    "entry_file" TEXT NOT NULL DEFAULT 'index.html',
    "port" INTEGER,
    "status" "HostingStatus" NOT NULL DEFAULT 'stopped',
    "pid" INTEGER,
    "last_error" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_hostings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_hostings_app_id_key" ON "app_hostings"("app_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_hostings_port_key" ON "app_hostings"("port");

-- AddForeignKey
ALTER TABLE "app_hostings" ADD CONSTRAINT "app_hostings_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
