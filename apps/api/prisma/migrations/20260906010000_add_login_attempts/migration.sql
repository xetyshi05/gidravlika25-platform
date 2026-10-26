CREATE TABLE "LoginAttempt" (
  "key" TEXT NOT NULL,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "LoginAttempt_lockedUntil_idx" ON "LoginAttempt"("lockedUntil");
