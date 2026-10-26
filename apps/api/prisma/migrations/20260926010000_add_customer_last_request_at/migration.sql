-- PERF-01: the CRM sorts customers by their newest request. Instead of a
-- correlated MAX() over "Request" for every customer on every page, the value
-- is stored on the customer and kept current by a trigger.
ALTER TABLE "Customer" ADD COLUMN "lastRequestAt" TIMESTAMP(3);

UPDATE "Customer" AS customer
SET "lastRequestAt" = latest."createdAt"
FROM (
  SELECT "customerId", MAX("createdAt") AS "createdAt"
  FROM "Request"
  WHERE "customerId" IS NOT NULL
  GROUP BY "customerId"
) AS latest
WHERE latest."customerId" = customer."id";

-- NULLS LAST matches ORDER BY "lastRequestAt" DESC NULLS LAST, so the first
-- page is read from the index instead of sorting every customer.
CREATE INDEX "Customer_lastRequestAt_idx"
  ON "Customer" ("lastRequestAt" DESC NULLS LAST, "createdAt" DESC, "id");

CREATE INDEX "Customer_lastName_firstName_idx" ON "Customer" ("lastName", "firstName");

-- Every write path (public forms, merges that move requests, restores, direct
-- inserts) goes through this trigger, so the column cannot drift.
CREATE FUNCTION "Request_customer_last_request_at"() RETURNS trigger AS $$
BEGIN
  IF NEW."customerId" IS NOT NULL THEN
    UPDATE "Customer"
    SET "lastRequestAt" = GREATEST(COALESCE("lastRequestAt", NEW."createdAt"), NEW."createdAt")
    WHERE "id" = NEW."customerId";
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Request_customer_last_request_at"
AFTER INSERT OR UPDATE OF "customerId", "createdAt" ON "Request"
FOR EACH ROW EXECUTE FUNCTION "Request_customer_last_request_at"();
