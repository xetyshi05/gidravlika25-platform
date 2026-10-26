ALTER TYPE "CustomerActivityType" ADD VALUE 'ANONYMIZED';

ALTER TABLE "Customer" ADD COLUMN "anonymizedAt" TIMESTAMP(3);

CREATE INDEX "Customer_anonymizedAt_idx" ON "Customer"("anonymizedAt");
