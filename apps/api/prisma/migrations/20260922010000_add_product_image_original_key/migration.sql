-- Keep the uploaded source private so a catalog image can be processed again
-- without asking an editor to re-upload it.
ALTER TABLE "Product" ADD COLUMN "imageOriginalKey" TEXT;
