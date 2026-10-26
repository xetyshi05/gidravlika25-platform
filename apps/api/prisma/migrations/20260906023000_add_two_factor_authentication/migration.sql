ALTER TABLE "User"
  ADD COLUMN "twoFactorSecret" TEXT,
  ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "twoFactorEnabledAt" TIMESTAMP(3);

ALTER TABLE "AuthSession"
  ADD COLUMN "twoFactorVerified" BOOLEAN NOT NULL DEFAULT false;

-- Sessions created before mandatory two-factor authentication must not remain usable.
DELETE FROM "AuthSession" WHERE "twoFactorVerified" = false;

CREATE TABLE "AuthTwoFactorChallenge" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "application" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "secret" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthTwoFactorChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthTwoFactorChallenge_tokenHash_key" ON "AuthTwoFactorChallenge"("tokenHash");
CREATE INDEX "AuthTwoFactorChallenge_userId_idx" ON "AuthTwoFactorChallenge"("userId");
CREATE INDEX "AuthTwoFactorChallenge_expiresAt_idx" ON "AuthTwoFactorChallenge"("expiresAt");
ALTER TABLE "AuthTwoFactorChallenge" ADD CONSTRAINT "AuthTwoFactorChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AuthRecoveryCode" (
  "id" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthRecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthRecoveryCode_codeHash_key" ON "AuthRecoveryCode"("codeHash");
CREATE INDEX "AuthRecoveryCode_userId_idx" ON "AuthRecoveryCode"("userId");
ALTER TABLE "AuthRecoveryCode" ADD CONSTRAINT "AuthRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
