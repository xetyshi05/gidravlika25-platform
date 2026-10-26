CREATE TABLE "PublicRequestSubmission" (
  "id" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublicRequestSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PublicRequestSubmission_keyHash_key" ON "PublicRequestSubmission"("keyHash");
CREATE UNIQUE INDEX "PublicRequestSubmission_requestId_key" ON "PublicRequestSubmission"("requestId");
CREATE INDEX "PublicRequestSubmission_expiresAt_idx" ON "PublicRequestSubmission"("expiresAt");
ALTER TABLE "PublicRequestSubmission" ADD CONSTRAINT "PublicRequestSubmission_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PublicRequestRateLimit" (
  "keyHash" TEXT NOT NULL,
  "requestCount" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublicRequestRateLimit_pkey" PRIMARY KEY ("keyHash")
);

CREATE INDEX "PublicRequestRateLimit_expiresAt_idx" ON "PublicRequestRateLimit"("expiresAt");
