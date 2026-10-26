-- pg_trgm accelerates the ILIKE '%value%' searches used by the public catalog
-- and Back Office without changing their query contract.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Product_isActive_categoryId_idx"
ON "Product"("isActive", "categoryId");

CREATE INDEX "Product_isActive_stockQuantity_name_idx"
ON "Product"("isActive", "stockQuantity" DESC, "name");

CREATE INDEX "Product_price_idx"
ON "Product"("price");

CREATE INDEX "Product_name_trgm_idx"
ON "Product" USING GIN ("name" gin_trgm_ops);

CREATE INDEX "Product_sku_trgm_idx"
ON "Product" USING GIN ("sku" gin_trgm_ops);
