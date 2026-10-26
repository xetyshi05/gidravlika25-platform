-- Preserve legacy source identifiers and image paths for repeatable catalog imports.
ALTER TABLE "Category" ADD COLUMN "legacyId" INTEGER;

ALTER TABLE "Product"
  ADD COLUMN "legacyId" INTEGER,
  ADD COLUMN "legacyImagePath" TEXT,
  ALTER COLUMN "pistonDiameterMm" DROP NOT NULL,
  ALTER COLUMN "rodDiameterMm" DROP NOT NULL,
  ALTER COLUMN "strokeMm" DROP NOT NULL,
  ALTER COLUMN "collapsedLengthMm" DROP NOT NULL,
  ALTER COLUMN "maxPressureMpa" DROP NOT NULL,
  ALTER COLUMN "nominalPressureMpa" DROP NOT NULL;

CREATE UNIQUE INDEX "Category_legacyId_key" ON "Category"("legacyId");
CREATE UNIQUE INDEX "Product_legacyId_key" ON "Product"("legacyId");
