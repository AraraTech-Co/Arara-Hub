-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "account" (
    "id" CHAR(36) NOT NULL,
    "plan" VARCHAR(64),
    "name" VARCHAR(256),
    "email" TEXT,
    "active" BOOLEAN NOT NULL,
    "stripe_subscription_id" VARCHAR(32),
    "stripe_customer_id" VARCHAR(32),
    "date_created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" CHAR(36) NOT NULL,
    "name" VARCHAR(32) NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "date_created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "support_enabled" BOOLEAN NOT NULL DEFAULT false,
    "2fa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "2fa_secret" TEXT,
    "2fa_backup_code" TEXT,
    "facebook_id" VARCHAR(128),
    "twitter_id" VARCHAR(128),
    "default_account" CHAR(36) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_users" (
    "account_id" CHAR(36) NOT NULL,
    "user_id" CHAR(36) NOT NULL,
    "permission" VARCHAR(64) NOT NULL,
    "onboarded" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "account_users_pkey" PRIMARY KEY ("account_id","user_id")
);

-- CreateTable
CREATE TABLE "push_token" (
    "id" SERIAL NOT NULL,
    "user" CHAR(36) NOT NULL,
    "token" VARCHAR(512) NOT NULL,

    CONSTRAINT "push_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite" (
    "id" CHAR(36) NOT NULL,
    "email" VARCHAR(512) NOT NULL,
    "permission" VARCHAR(32) NOT NULL DEFAULT 'user',
    "account_id" CHAR(36) NOT NULL,
    "date_sent" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL,

    CONSTRAINT "invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token" (
    "id" CHAR(36) NOT NULL,
    "provider" VARCHAR(64) NOT NULL,
    "jwt" TEXT,
    "access" TEXT,
    "refresh" TEXT,
    "user_id" CHAR(36) NOT NULL,

    CONSTRAINT "token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_key" (
    "id" CHAR(36) NOT NULL,
    "name" TEXT,
    "key" TEXT NOT NULL,
    "scope" JSONB NOT NULL DEFAULT '[]',
    "date_created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "account_id" CHAR(36) NOT NULL,

    CONSTRAINT "api_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log" (
    "id" CHAR(36) NOT NULL,
    "time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message" TEXT,
    "body" TEXT,
    "method" VARCHAR(64),
    "endpoint" TEXT,
    "account_id" CHAR(36),
    "user_id" CHAR(36),

    CONSTRAINT "log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login" (
    "id" CHAR(36) NOT NULL,
    "user_id" CHAR(36) NOT NULL,
    "ip" TEXT NOT NULL,
    "time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "browser" TEXT,
    "device" TEXT,

    CONSTRAINT "login_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event" (
    "id" CHAR(36) NOT NULL,
    "name" TEXT NOT NULL,
    "metadata" JSONB,
    "time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" CHAR(36),
    "account_id" CHAR(36),

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" CHAR(36) NOT NULL,
    "rating" VARCHAR(12) NOT NULL,
    "comment" TEXT,
    "date_created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" CHAR(36) NOT NULL,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preview" (
    "id" CHAR(36) NOT NULL,
    "account_id" CHAR(36) NOT NULL,

    CONSTRAINT "preview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracker" (
    "id" CHAR(36) NOT NULL,
    "account_id" CHAR(36) NOT NULL,
    "user_id" CHAR(36) NOT NULL,

    CONSTRAINT "tracker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracker_entry" (
    "id" CHAR(36) NOT NULL,
    "tracker_id" CHAR(36) NOT NULL,
    "path" TEXT NOT NULL,
    "permission" TEXT,
    "provider" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracker_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_email_idx" ON "user"("email");

-- CreateIndex
CREATE INDEX "account_users_account_id_idx" ON "account_users"("account_id");

-- CreateIndex
CREATE INDEX "account_users_user_id_idx" ON "account_users"("user_id");

-- CreateIndex
CREATE INDEX "push_token_user_idx" ON "push_token"("user");

-- CreateIndex
CREATE INDEX "invite_account_id_idx" ON "invite"("account_id");

-- CreateIndex
CREATE INDEX "token_user_id_idx" ON "token"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_key_key_key" ON "api_key"("key");

-- CreateIndex
CREATE INDEX "api_key_account_id_idx" ON "api_key"("account_id");

-- CreateIndex
CREATE INDEX "log_account_id_idx" ON "log"("account_id");

-- CreateIndex
CREATE INDEX "log_user_id_idx" ON "log"("user_id");

-- CreateIndex
CREATE INDEX "login_user_id_idx" ON "login"("user_id");

-- CreateIndex
CREATE INDEX "event_name_time_idx" ON "event"("name", "time");

-- CreateIndex
CREATE INDEX "event_account_id_idx" ON "event"("account_id");

-- CreateIndex
CREATE INDEX "feedback_user_id_idx" ON "feedback"("user_id");

-- CreateIndex
CREATE INDEX "preview_account_id_idx" ON "preview"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "tracker_user_id_key" ON "tracker"("user_id");

-- CreateIndex
CREATE INDEX "tracker_entry_tracker_id_idx" ON "tracker_entry"("tracker_id");

-- AddForeignKey
ALTER TABLE "account_users" ADD CONSTRAINT "account_users_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_users" ADD CONSTRAINT "account_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_token" ADD CONSTRAINT "push_token_user_fkey" FOREIGN KEY ("user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite" ADD CONSTRAINT "invite_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token" ADD CONSTRAINT "token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log" ADD CONSTRAINT "log_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log" ADD CONSTRAINT "log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login" ADD CONSTRAINT "login_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preview" ADD CONSTRAINT "preview_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracker" ADD CONSTRAINT "tracker_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracker" ADD CONSTRAINT "tracker_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracker_entry" ADD CONSTRAINT "tracker_entry_tracker_id_fkey" FOREIGN KEY ("tracker_id") REFERENCES "tracker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

