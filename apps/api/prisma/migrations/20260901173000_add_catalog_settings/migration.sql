CREATE TABLE "CatalogSettings" (
  "id" TEXT NOT NULL DEFAULT 'catalog',
  "lowStockThreshold" INTEGER NOT NULL DEFAULT 5,
  "showOutOfStock" BOOLEAN NOT NULL DEFAULT true,
  "showPrices" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CatalogSettings_pkey" PRIMARY KEY ("id")
);
