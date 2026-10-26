INSERT INTO "CustomerActivity" ("id", "customerId", "type", "data", "createdAt")
SELECT
  'backfill-created-' || customer."id",
  customer."id",
  'CREATED'::"CustomerActivityType",
  jsonb_build_object('source', 'migration'),
  customer."createdAt"
FROM "Customer" AS customer
WHERE NOT EXISTS (
  SELECT 1
  FROM "CustomerActivity" AS activity
  WHERE activity."customerId" = customer."id"
    AND activity."type" = 'CREATED'::"CustomerActivityType"
);

INSERT INTO "CustomerActivity" ("id", "customerId", "type", "data", "createdAt")
SELECT
  'backfill-request-' || request."id",
  request."customerId",
  'REQUEST_ATTACHED'::"CustomerActivityType",
  jsonb_build_object('requestId', request."id", 'requestNumber', request."number"),
  request."createdAt"
FROM "Request" AS request
WHERE request."customerId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "CustomerActivity" AS activity
    WHERE activity."customerId" = request."customerId"
      AND activity."type" = 'REQUEST_ATTACHED'::"CustomerActivityType"
      AND activity."data" ->> 'requestId' = request."id"
  );
