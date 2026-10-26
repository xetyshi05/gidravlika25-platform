-- Complete the dual-read migration without depending on a particular S3 bucket URL.
-- Legacy imports use the canonical catalog/<legacyId>.webp object layout. For
-- non-legacy records, recover an already managed catalog/products key from a
-- stored absolute URL or retain an existing managed key.
UPDATE "Product"
SET "imageKey" = CASE
  WHEN "legacyId" IS NOT NULL
    THEN 'catalog/' || "legacyId"::text || '.webp'
  WHEN "legacyImagePath" ~ '^(catalog|products)/[A-Za-z0-9._/-]+$'
    THEN "legacyImagePath"
  WHEN "legacyImagePath" ~ '^https?://[^?#]+/(catalog|products)/[A-Za-z0-9._/-]+$'
    THEN regexp_replace("legacyImagePath", '^.*/(catalog|products)/', '\1/')
  ELSE NULL
END
WHERE "imageKey" IS NULL
  AND "legacyImagePath" IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Product"
    WHERE "legacyImagePath" IS NOT NULL
      AND "imageKey" IS NULL
  ) THEN
    RAISE EXCEPTION
      'Product image migration stopped: unresolved legacyImagePath values remain. Backfill imageKey before retrying.';
  END IF;
END $$;

ALTER TABLE "Product" DROP COLUMN "legacyImagePath";
