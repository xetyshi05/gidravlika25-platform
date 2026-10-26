ALTER TABLE "SiteMedia" ALTER COLUMN "originalKey" DROP NOT NULL;
ALTER TABLE "SiteMedia" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
CREATE UNIQUE INDEX "SiteMedia_imageKey_key" ON "SiteMedia"("imageKey");
