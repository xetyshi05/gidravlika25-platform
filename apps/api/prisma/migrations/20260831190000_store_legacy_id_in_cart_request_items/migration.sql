ALTER TABLE "CartRequestItem"
ADD COLUMN "legacyId" INTEGER;

UPDATE "CartRequestItem" AS item
SET "legacyId" = product."legacyId"
FROM "Product" AS product
WHERE item."productId" = product.id;
