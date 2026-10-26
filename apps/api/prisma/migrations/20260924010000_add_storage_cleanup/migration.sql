-- CreateEnum
CREATE TYPE "StoredFileLocation" AS ENUM ('PUBLIC_BUCKET', 'ORIGINALS');

-- CreateTable
CREATE TABLE "StorageCleanup" (
    "id" TEXT NOT NULL,
    "location" "StoredFileLocation" NOT NULL,
    "key" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorageCleanup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StorageCleanup_nextAttemptAt_idx" ON "StorageCleanup"("nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "StorageCleanup_location_key_key" ON "StorageCleanup"("location", "key");
