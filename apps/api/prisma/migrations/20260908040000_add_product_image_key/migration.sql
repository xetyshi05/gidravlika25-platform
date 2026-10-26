-- Store catalog image locations independently from the current S3 public origin.
-- Keep legacyImagePath during the dual-read migration window for rollback safety.
ALTER TABLE "Product" ADD COLUMN "imageKey" TEXT;

UPDATE "Product"
SET "imageKey" = CASE
  WHEN left(
    "legacyImagePath",
    length('https://s3.twcstorage.ru/a66d7ec3-a715-4a73-851e-841449235574/')
  ) = 'https://s3.twcstorage.ru/a66d7ec3-a715-4a73-851e-841449235574/'
    THEN substring(
      "legacyImagePath"
      FROM length('https://s3.twcstorage.ru/a66d7ec3-a715-4a73-851e-841449235574/') + 1
    )
  ELSE "legacyImagePath"
END
WHERE "imageKey" IS NULL
  AND (
    (
      left(
        "legacyImagePath",
        length('https://s3.twcstorage.ru/a66d7ec3-a715-4a73-851e-841449235574/')
      ) = 'https://s3.twcstorage.ru/a66d7ec3-a715-4a73-851e-841449235574/'
      AND substring(
        "legacyImagePath"
        FROM length('https://s3.twcstorage.ru/a66d7ec3-a715-4a73-851e-841449235574/') + 1
      ) ~ '^(catalog|products)/[A-Za-z0-9._/-]+$'
      AND substring(
        "legacyImagePath"
        FROM length('https://s3.twcstorage.ru/a66d7ec3-a715-4a73-851e-841449235574/') + 1
      ) !~ '(^|/)\.\.(/|$)'
    )
    OR (
      "legacyImagePath" ~ '^(catalog|products)/[A-Za-z0-9._/-]+$'
      AND "legacyImagePath" !~ '(^|/)\.\.(/|$)'
    )
  );
