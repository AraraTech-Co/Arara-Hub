-- CreateTable
CREATE TABLE "plan" (
    "id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(256) NOT NULL,
    "price" INTEGER NOT NULL,
    "interval" VARCHAR(32) NOT NULL,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'brl',
    "features" JSONB NOT NULL DEFAULT '[]',
    "stripe_product_id" VARCHAR(64),
    "stripe_price_id" VARCHAR(64),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_free" BOOLEAN NOT NULL DEFAULT false,
    "date_created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("id")
);
