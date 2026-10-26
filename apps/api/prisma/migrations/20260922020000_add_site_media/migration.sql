CREATE TYPE "SiteMediaKind" AS ENUM ('HERO', 'GALLERY');

CREATE TABLE "SiteMedia" (
    "id" TEXT NOT NULL,
    "kind" "SiteMediaKind" NOT NULL,
    "imageKey" TEXT NOT NULL,
    "originalKey" TEXT NOT NULL,
    "alt" TEXT NOT NULL,
    "title" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteMedia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SiteMedia_kind_position_idx" ON "SiteMedia"("kind", "position");
