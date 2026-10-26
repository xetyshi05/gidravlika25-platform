CREATE TABLE "BackofficeActivity" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BackofficeActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BackofficeActivity_createdAt_idx" ON "BackofficeActivity"("createdAt");
CREATE INDEX "BackofficeActivity_userId_idx" ON "BackofficeActivity"("userId");

ALTER TABLE "BackofficeActivity"
  ADD CONSTRAINT "BackofficeActivity_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
