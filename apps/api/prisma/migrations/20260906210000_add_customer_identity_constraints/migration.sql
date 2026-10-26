BEGIN;

ALTER TABLE "Customer" ADD COLUMN "normalizedEmail" TEXT;

UPDATE "Customer"
SET "normalizedPhone" = NULL
WHERE "normalizedPhone" IS NOT NULL
  AND btrim("normalizedPhone") = '';

UPDATE "Customer"
SET "normalizedEmail" = NULLIF(lower(btrim("email")), '');

-- Automatically merge only byte-for-byte identical customer cards. Ambiguous
-- duplicates are deliberately rejected below so a deployment cannot silently
-- combine two different people who share a phone number or email address.
CREATE TEMPORARY TABLE "_CustomerExactDuplicateMerge" ON COMMIT DROP AS
SELECT
  id AS "sourceId",
  first_value(id) OVER (
    PARTITION BY
      "firstName",
      "lastName",
      "middleName",
      phone,
      "normalizedPhone",
      email,
      "normalizedEmail",
      company
    ORDER BY "createdAt", id
  ) AS "targetId"
FROM "Customer";

UPDATE "Request" AS request
SET "customerId" = merge."targetId"
FROM "_CustomerExactDuplicateMerge" AS merge
WHERE request."customerId" = merge."sourceId"
  AND merge."sourceId" <> merge."targetId";

UPDATE "CustomerActivity" AS activity
SET "customerId" = merge."targetId"
FROM "_CustomerExactDuplicateMerge" AS merge
WHERE activity."customerId" = merge."sourceId"
  AND merge."sourceId" <> merge."targetId";

DELETE FROM "Customer" AS customer
USING "_CustomerExactDuplicateMerge" AS merge
WHERE customer.id = merge."sourceId"
  AND merge."sourceId" <> merge."targetId";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Customer"
    WHERE "normalizedPhone" IS NOT NULL
    GROUP BY "normalizedPhone"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Ambiguous duplicate customers by normalized phone must be merged before this migration can continue';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Customer"
    WHERE "normalizedEmail" IS NOT NULL
    GROUP BY "normalizedEmail"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Ambiguous duplicate customers by normalized email must be merged before this migration can continue';
  END IF;
END $$;

DROP INDEX IF EXISTS "Customer_normalizedPhone_idx";
CREATE UNIQUE INDEX "Customer_normalizedPhone_key"
ON "Customer"("normalizedPhone");
CREATE UNIQUE INDEX "Customer_normalizedEmail_key"
ON "Customer"("normalizedEmail");

COMMIT;
