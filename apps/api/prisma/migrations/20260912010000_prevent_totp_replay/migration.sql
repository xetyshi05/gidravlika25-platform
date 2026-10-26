-- Remember the last accepted TOTP time step so a code cannot be replayed,
-- including by two concurrent verification requests.
ALTER TABLE "User" ADD COLUMN "lastTotpCounter" BIGINT;
