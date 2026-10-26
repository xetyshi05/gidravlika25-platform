CREATE TYPE "CustomerActivityType" AS ENUM ('CREATED', 'UPDATED', 'REQUEST_ATTACHED', 'MERGED');

ALTER TABLE "Customer" ADD COLUMN "normalizedPhone" TEXT;

WITH customer_phones AS (
  SELECT
    "id",
    regexp_replace("phone", '\D', '', 'g') AS digits
  FROM "Customer"
)
UPDATE "Customer" AS customer
SET "normalizedPhone" = CASE
  WHEN length(customer_phones.digits) = 11 AND left(customer_phones.digits, 1) = '8'
    THEN '+7' || substring(customer_phones.digits FROM 2)
  WHEN length(customer_phones.digits) = 11 AND left(customer_phones.digits, 1) = '7'
    THEN '+' || customer_phones.digits
  WHEN length(customer_phones.digits) = 10
    THEN '+7' || customer_phones.digits
  ELSE NULL
END
FROM customer_phones
WHERE customer."id" = customer_phones."id";

CREATE INDEX "Customer_normalizedPhone_idx" ON "Customer"("normalizedPhone");

CREATE TABLE "CustomerActivity" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "userId" TEXT,
  "type" "CustomerActivityType" NOT NULL,
  "data" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CustomerActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerActivity_customerId_createdAt_idx" ON "CustomerActivity"("customerId", "createdAt");
CREATE INDEX "CustomerActivity_userId_idx" ON "CustomerActivity"("userId");

ALTER TABLE "CustomerActivity" ADD CONSTRAINT "CustomerActivity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerActivity" ADD CONSTRAINT "CustomerActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
