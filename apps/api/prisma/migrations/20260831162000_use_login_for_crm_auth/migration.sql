ALTER TABLE "User" ADD COLUMN "login" TEXT;
UPDATE "User" SET "login" = lower(split_part("email", '@', 1)) WHERE "login" IS NULL;
ALTER TABLE "User" ALTER COLUMN "login" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");
