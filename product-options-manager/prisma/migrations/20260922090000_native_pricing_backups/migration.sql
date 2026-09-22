-- Preserve a product's original Shopify options and variants before native
-- Product Options pricing variants are generated.
CREATE TABLE "NativePricingBackup" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NativePricingBackup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NativePricingBackup_shop_productId_key"
ON "NativePricingBackup"("shop", "productId");
