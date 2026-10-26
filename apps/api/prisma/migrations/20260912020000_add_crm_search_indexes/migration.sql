-- CRM performs contains/ILIKE searches across customers and their requests.
-- Trigram GIN indexes preserve substring matching while avoiding sequential scans
-- as these tables grow. pg_trgm is already enabled by the catalog migration, but
-- keeping this idempotent makes the dependency explicit.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Customer_firstName_trgm_idx"
ON "Customer" USING GIN ("firstName" gin_trgm_ops);

CREATE INDEX "Customer_lastName_trgm_idx"
ON "Customer" USING GIN ("lastName" gin_trgm_ops);

CREATE INDEX "Customer_middleName_trgm_idx"
ON "Customer" USING GIN ("middleName" gin_trgm_ops);

CREATE INDEX "Customer_phone_trgm_idx"
ON "Customer" USING GIN ("phone" gin_trgm_ops);

CREATE INDEX "Customer_email_trgm_idx"
ON "Customer" USING GIN ("email" gin_trgm_ops);

CREATE INDEX "Customer_company_trgm_idx"
ON "Customer" USING GIN ("company" gin_trgm_ops);

CREATE INDEX "Request_number_trgm_idx"
ON "Request" USING GIN ("number" gin_trgm_ops);

CREATE INDEX "Request_firstName_trgm_idx"
ON "Request" USING GIN ("firstName" gin_trgm_ops);

CREATE INDEX "Request_lastName_trgm_idx"
ON "Request" USING GIN ("lastName" gin_trgm_ops);

CREATE INDEX "Request_phone_trgm_idx"
ON "Request" USING GIN ("phone" gin_trgm_ops);

CREATE INDEX "Request_email_trgm_idx"
ON "Request" USING GIN ("email" gin_trgm_ops);

CREATE INDEX "Request_company_trgm_idx"
ON "Request" USING GIN ("company" gin_trgm_ops);
