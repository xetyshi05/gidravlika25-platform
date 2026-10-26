BEGIN;

ALTER TABLE "Request"
  ADD COLUMN "responseDueAt" TIMESTAMP(3),
  ADD COLUMN "firstRespondedAt" TIMESTAMP(3);

UPDATE "Request"
SET "responseDueAt" = "createdAt" + INTERVAL '60 minutes';

UPDATE "Request" AS request
SET "firstRespondedAt" = COALESCE(
  (
    SELECT min(activity."createdAt")
    FROM "RequestActivity" AS activity
    WHERE activity."requestId" = request.id
      AND activity.type = 'STATUS_CHANGED'
      AND activity.data->>'from' = 'NEW'
      AND activity.data->>'to' <> 'CANCELLED'
  ),
  CASE
    WHEN request.status NOT IN ('NEW', 'CANCELLED') THEN request."updatedAt"
    ELSE NULL
  END
);

ALTER TABLE "Request"
  ALTER COLUMN "responseDueAt" SET NOT NULL,
  ALTER COLUMN "responseDueAt" SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '60 minutes');

CREATE TABLE "RequestReadState" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequestReadState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RequestReadState_requestId_userId_key"
ON "RequestReadState"("requestId", "userId");

CREATE INDEX "RequestReadState_userId_idx"
ON "RequestReadState"("userId");

CREATE INDEX "Request_status_responseDueAt_idx"
ON "Request"("status", "responseDueAt");

ALTER TABLE "RequestReadState"
ADD CONSTRAINT "RequestReadState_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "Request"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RequestReadState"
ADD CONSTRAINT "RequestReadState_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- There was no read history before this migration, so existing requests are
-- treated as read at rollout time. New requests start without read-state rows.
INSERT INTO "RequestReadState" ("id", "requestId", "userId", "readAt")
SELECT
  'legacy-' || md5(request.id || ':' || app_user.id),
  request.id,
  app_user.id,
  CURRENT_TIMESTAMP
FROM "Request" AS request
CROSS JOIN "User" AS app_user
WHERE app_user."isActive" = true;

COMMIT;
