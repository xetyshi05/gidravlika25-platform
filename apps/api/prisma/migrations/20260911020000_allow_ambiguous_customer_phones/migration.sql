-- A phone number alone is not sufficient evidence that two requests belong to
-- the same person. Keep it indexed for lookup, but allow ambiguous contacts to
-- remain separate until an operator confirms a merge in CRM.
DROP INDEX IF EXISTS "Customer_normalizedPhone_key";

CREATE INDEX "Customer_normalizedPhone_idx"
ON "Customer"("normalizedPhone");
